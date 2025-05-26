const { chromium } = require('playwright');
const fs = require('fs');
const { Parser } = require('json2csv');

async function getAllCategories(page) {
    return await page.evaluate(() => {
        const categories = [];
        document.querySelectorAll('.navleft-container.hidden-md-down .parentMenu').forEach(parent => {
            const link = parent.querySelector('a');
            const span = parent.querySelector('span');
            if (link && span) {
                categories.push({
                    name: span.textContent.trim(),
                    url: link.getAttribute('href')
                });
            }
        });
        return categories;
    });
}

async function processPage(page, url, categoryName) {
    await page.goto(url, { waitUntil: 'networkidle' });

    return await page.evaluate((categoryName) => {
        const products = [];
        const productElements = document.querySelectorAll('.products.row.product_content.grid .item-product');

        productElements.forEach(product => {
            const item = {};
            const imgBlock = product.querySelector('.img_block img');
            const productName = product.querySelector('.product_desc .product_name');

            item.imagen_url = imgBlock ? imgBlock.src : null;
            item.nombre_producto = productName ? productName.textContent.trim() : null;
            item.categoria = categoryName;

            if (item.imagen_url || item.nombre_producto) {
                products.push(item);
            }
        });
        return products;
    }, categoryName);
}

async function scrapeJPMascota() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    let allProductsData = [];
    let categoriesToProcess = [];

    try {
        await page.goto('https://www.jpmascota.com/', { waitUntil: 'networkidle' });
        categoriesToProcess = await getAllCategories(page);
        console.log(`Categorías iniciales encontradas: ${categoriesToProcess.length}`);

        while (categoriesToProcess.length > 0) {
            const category = categoriesToProcess.shift();
            console.log(`\nProcesando: ${category.name}`);

            let currentPage = 1;
            let hasNextPage = true;

            while (hasNextPage) {
                const pageUrl = `${category.url}?page=${currentPage}`;
                console.log(`Visitando: ${pageUrl}`);
                await page.goto(pageUrl, { waitUntil: 'networkidle' });

                // Verificar subcategorías
                const subCategories = await page.evaluate(() => {
                    const blockCategories = document.querySelector('.block-categories.hidden-sm-down');
                    if (blockCategories) {
                        const subLinks = blockCategories.querySelectorAll('.category-sub-menu a');
                        return Array.from(subLinks).map(link => ({
                            name: link.textContent.trim(),
                            url: link.getAttribute('href')
                        }));
                    }
                    return [];
                });

                if (subCategories.length > 0) {
                    console.log(`Encontradas ${subCategories.length} subcategorías en ${category.name}`);
                    categoriesToProcess.push(...subCategories);
                    break;
                }

                // Procesar productos de la página actual
                try {
                    await page.waitForSelector('.products.row.product_content.grid .item-product', { timeout: 5000 });
                    const pageProducts = await processPage(page, pageUrl, category.name);
                    allProductsData.push(...pageProducts);
                    console.log(`Obtenidos ${pageProducts.length} productos`);

                    // Guardar datos parciales cada 100 productos
                    if (allProductsData.length % 100 === 0) {
                        fs.writeFileSync('productos_jpmascota_partial.json', JSON.stringify(allProductsData, null, 2));
                        console.log('Guardado parcial realizado');
                    }

                    // Verificar siguiente página
                    hasNextPage = await page.evaluate(() => {
                        const nextLink = document.querySelector('a.next.js-search-link');
                        return nextLink && !nextLink.classList.contains('disabled');
                    });

                    if (hasNextPage) {
                        currentPage++;
                        await page.waitForTimeout(2000);
                    }
                } catch (error) {
                    console.log('No se encontraron productos en esta página');
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error durante el scraping:', error);
    } finally {
        await browser.close();
    }

    return allProductsData;
}

async function main() {
    try {
        console.log('Iniciando scraping...');
        const data = await scrapeJPMascota();

        if (data.length > 0) {
            // Guardar JSON
            fs.writeFileSync('productos_jpmascota.json', JSON.stringify(data, null, 2));
            console.log(`JSON guardado con ${data.length} productos`);

            // Guardar CSV
            const fields = ['nombre_producto', 'imagen_url', 'categoria'];
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(data);
            fs.writeFileSync('productos_jpmascota.csv', csv);
            console.log('CSV guardado exitosamente');
        } else {
            console.log('No se encontraron productos para guardar');
        }
    } catch (error) {
        console.error('Error en el proceso:', error);
    }
}

main();
