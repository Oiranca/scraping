const { chromium } = require('playwright');
const fs = require('fs');
const { Parser } = require('json2csv');

async function scrapeJPMascota() {
    const browser = await chromium.launch({
        headless: true, // Cambiar a false si quieres ver el navegador en acción
        timeout: 60000, // Tiempo máximo de espera para cada acción
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Opciones para evitar problemas en algunos entornos
    });
    const page = await browser.newPage();
    let allProductsData = [];
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage) {
        // Navegar a la página correspondiente
       // await page.goto(`https://www.jpmascota.com/97-perros?page=${currentPage}`, { waitUntil: 'networkidle' });
        await page.goto(`https://www.jpmascota.com/103-accesorios-de-ganader%C3%ADa?page=${currentPage}`, { waitUntil: 'networkidle' });

        // Esperar a que los productos se carguen
        await page.waitForSelector('.products.row.product_content.grid .item-product');

        // Extraer los productos de la página actual
        const pageProductsData = await page.evaluate(() => {
            const products = [];
            const productElements = document.querySelectorAll('.products.row.product_content.grid .item-product');

            productElements.forEach(product => {
                const item = {};

                // Extraer solo la URL de la imagen
                const imgBlock = product.querySelector('.img_block');
                if (imgBlock) {
                    const imgTag = imgBlock.querySelector('img');
                    item.imagen_url = imgTag ? imgTag.src : null;
                }

                // Extraer nombre del producto
                const productDesc = product.querySelector('.product_desc');
                if (productDesc) {
                    const productNameTag = productDesc.querySelector('.product_name');
                    item.nombre_producto = productNameTag ? productNameTag.textContent.trim() : null;
                }

                // Solo añadir al array si se ha encontrado información relevante
                if (item.imagen_url || item.nombre_producto) {
                    products.push(item);
                }
            });
            return products;
        });

        // Añadir los productos de esta página al array general
        allProductsData = [...allProductsData, ...pageProductsData];

        // Verificar si hay siguiente página
        hasNextPage = await page.evaluate(() => {
            const nextButton = document.querySelector('.pagination .next:not(.disabled)');
            return !!nextButton;
        });

        console.log(`Página ${currentPage} procesada. Productos encontrados: ${pageProductsData.length}`);
        currentPage++;

        // Pequeña pausa entre páginas para no sobrecargar el servidor
        await page.waitForTimeout(1000);
    }

    await browser.close();
    return allProductsData;
}

async function main() {
    try {
        console.log('Iniciando el proceso de scraping...');
        const data = await scrapeJPMascota();

        console.log(`Total de productos encontrados: ${data.length}`);

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
