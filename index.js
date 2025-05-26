const { chromium } = require('playwright');
const fs = require('fs');
const { Parser } = require('json2csv');

async function scrapeJPMascota() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://www.jpmascota.com/97-perros', { waitUntil: 'networkidle' });

    // Esperar a que los productos se carguen
    await page.waitForSelector('.products.row.product_content.grid .item-product');

    const productsData = await page.evaluate(() => {
        const products = [];
        const productElements = document.querySelectorAll('.products.row.product_content.grid .item-product');

        productElements.forEach(product => {
            const item = {};

            // Extraer imagen y link de la imagen
            const imgBlock = product.querySelector('.img_block');
            if (imgBlock) {
                const imgTag = imgBlock.querySelector('img');
                const aTag = imgBlock.querySelector('a');
                item.imagen_url = imgTag ? imgTag.src : null;
                item.link_imagen = aTag ? aTag.href : null;
            }

            // Extraer nombre del producto
            const productDesc = product.querySelector('.product_desc');
            if (productDesc) {
                const productNameTag = productDesc.querySelector('.product_name');
                item.nombre_producto = productNameTag ? productNameTag.textContent.trim() : null;
            }
            // Solo añadir al array si se ha encontrado información relevante
            if (item.imagen_url || item.link_imagen || item.nombre_producto) {
                products.push(item);
            }
        });
        return products;
    });

    await browser.close();
    return productsData;
}

async function main() {
    try {
        const data = await scrapeJPMascota();

        // Guardar en JSON
        fs.writeFileSync('productos_jpmascota.json', JSON.stringify(data, null, 2));
        console.log('Datos guardados en productos_jpmascota.json');

        // Convertir a CSV
        if (data.length > 0) {
            const fields = Object.keys(data[0]);
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(data);
            fs.writeFileSync('productos_jpmascota.csv', csv);
            console.log('Datos guardados en productos_jpmascota.csv');
        } else {
            console.log('No se encontraron productos para convertir a CSV.');
        }

    } catch (error) {
        console.error('Error durante el scraping:', error);
    }
}

main();