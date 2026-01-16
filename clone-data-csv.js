const axios = require('axios');
const ObjectsToCsv = require('objects-to-csv');
require('dotenv').config();

const { SOURCE_STORE_DOMAIN } = process.env;

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
            } else { keepFetching = false; }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            keepFetching = false;
        }
    }
    return allProducts;
}

async function main() {
    try {
        console.log("Starting: Scrapping data to Shopify CSV format...");
        const colResponse = await axios.get(`https://${SOURCE_STORE_DOMAIN}/collections.json`);
        const collections = colResponse.data.collections;
        let csvData = [];

        for (const collection of collections) {
            const products = await getProductsFromCollection(collection.handle);

            for (const p of products) {
                // Tối đa 3 options theo chuẩn Shopify
                const opt1Name = p.options[0]?.name || '';
                const opt2Name = p.options[1]?.name || '';
                const opt3Name = p.options[2]?.name || '';

                // Lặp qua từng variant để tạo dòng
                p.variants.forEach((variant, index) => {
                    const isFirstRow = index === 0;
                    
                    const row = {
                        'Title': isFirstRow ? p.title : '',
                        'URL handle': p.handle,
                        'Description': isFirstRow ? p.body_html?.replace(/(\r\n|\n|\r)/gm, "") : '',
                        'Vendor': isFirstRow ? p.vendor : '',
                        'Product category': '', // Shopify tự động nhận diện hoặc điền sau
                        'Type': isFirstRow ? p.product_type : '',
                        'Tags': isFirstRow ? p.tags.join(', ') : '',
                        'Published on online store': 'TRUE',
                        'Status': 'active',
                        'SKU': variant.sku,
                        'Barcode': '',
                        'Option1 name': isFirstRow ? opt1Name : '',
                        'Option1 value': variant.option1 || '',
                        'Option2 name': isFirstRow ? opt2Name : '',
                        'Option2 value': variant.option2 || '',
                        'Option3 name': isFirstRow ? opt3Name : '',
                        'Option3 value': variant.option3 || '',
                        'Price': variant.price,
                        'Compare-at price': variant.compare_at_price || '',
                        'Inventory tracker': 'shopify',
                        'Inventory quantity': 100, // Mặc định
                        'Continue selling when out of stock': 'DENY',
                        'Weight value (grams)': variant.grams || 0,
                        'Weight unit for display': 'g',
                        'Requires shipping': variant.requires_shipping ? 'TRUE' : 'FALSE',
                        'Fulfillment service': 'manual',
                        'Product image URL': p.images[index]?.src || '', // Lấy ảnh theo vị trí index
                        'Image position': p.images[index] ? index + 1 : '',
                        'Image alt text': p.title,
                        'Gift card': 'FALSE'
                    };
                    csvData.push(row);
                });

                // Nếu số lượng ảnh nhiều hơn số lượng variant, thêm các dòng ảnh còn lại
                if (p.images.length > p.variants.length) {
                    for (let i = p.variants.length; i < p.images.length; i++) {
                        csvData.push({
                            'URL handle': p.handle,
                            'Product image URL': p.images[i].src,
                            'Image position': i + 1,
                            'Image alt text': p.title
                        });
                    }
                }
            }
        }

        const csv = new ObjectsToCsv(csvData);
        await csv.toDisk('./shopify_products_export.csv', { append: false });
        console.log(`Successfully exported ${csvData.length} rows to shopify_products_export.csv`);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();