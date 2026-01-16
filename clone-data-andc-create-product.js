const axios = require('axios');
const Bottleneck = require('bottleneck');
require('dotenv').config();

// Cấu hình giới hạn tốc độ: 2 request mỗi giây cho Shopify REST API
const limiter = new Bottleneck({
  minTime: 500 
});

const { TARGET_STORE_DOMAIN, ADMIN_ACCESS_TOKEN, SOURCE_STORE_DOMAIN } = process.env;

const shopifyApi = axios.create({
  baseURL: `https://${TARGET_STORE_DOMAIN}/admin/api/2024-01`,
  headers: {
    'X-Shopify-Access-Token': ADMIN_ACCESS_TOKEN,
    'Content-Type': 'application/json'
  }
});

/**
 * Kiểm tra sản phẩm đã tồn tại hay chưa dựa trên Handle
 */
async function checkProductExists(handle) {
  try {
    const response = await shopifyApi.get(`/products.json?handle=${handle}`);
    return response.data.products.length > 0;
  } catch (error) {
    console.error(`Error checking existence for ${handle}:`, error.message);
    return false;
  }
}

/**
 * Lấy toàn bộ sản phẩm từ một Collection cụ thể (Xử lý phân trang)
 */
async function getProductsFromCollection(handle) {
  let allProducts = [];
  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    console.log(`   Fetching page ${page} for collection: ${handle}`);
    const url = `https://${SOURCE_STORE_DOMAIN}/collections/${handle}/products.json?page=${page}&limit=250`;
    
    try {
      const response = await axios.get(url);
      const products = response.data.products;

      if (products && products.length > 0) {
        allProducts.push(...products);
        page++;
      } else {
        keepFetching = false;
      }
    } catch (error) {
      console.error(`Error fetching products for ${handle}:`, error.message);
      keepFetching = false;
    }
  }
  return allProducts;
}

/**
 * Tạo sản phẩm mới trên Store đích
 */
const createProduct = limiter.wrap(async (product) => {
  const exists = await checkProductExists(product.handle);
  if (exists) {
    console.log(`[Skip] Product "${product.title}" already exists.`);
    return;
  }

  const payload = {
    product: {
      title: product.title,
      body_html: product.body_html,
      vendor: product.vendor,
      product_type: product.product_type,
      handle: product.handle,
      tags: product.tags.join(','),
      variants: product.variants.map(v => ({
        option1: v.option1,
        option2: v.option2,
        option3: v.option3,
        price: v.price,
        sku: v.sku,
        requires_shipping: v.requires_shipping,
        taxable: v.taxable,
        inventory_management: "shopify"
      })),
      images: product.images.map(img => ({ src: img.src })) // Shopify tự download từ URL
    }
  };

  try {
    await shopifyApi.post('/products.json', payload);
    console.log(`[Success] Imported: ${product.title}`);
  } catch (error) {
    console.error(`[Failed] ${product.title}:`, error.response?.data || error.message);
  }
});

/**
 * Luồng chính
 */
async function main() {
  try {
    console.log("Starting: Fetching collections...");
    const colResponse = await axios.get(`https://${SOURCE_STORE_DOMAIN}/collections.json`);
    const collections = colResponse.data.collections;

    for (const collection of collections) {
      console.log(`Processing Collection: ${collection.title} (Handle: ${collection.handle})`);
      
      const products = await getProductsFromCollection(collection.handle);
      console.log(`Found ${products.length} products in ${collection.handle}`);

      for (const product of products) {
        await createProduct(product);
      }
    }
    console.log("Finished migration.");
  } catch (error) {
    console.error("Main Loop Error:", error.message);
  }
}

main();