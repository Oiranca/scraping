const { chromium } = require('playwright');
const fs = require('fs');
const { Parser } = require('json2csv');

// Función para normalizar las categorías
function normalizeCategory(category) {
    // Lista de palabras que siempre deben ir en minúscula
    const lowercaseWords = ['y', 'e', 'o', 'de', 'del', 'la', 'las', 'el', 'los', 'para', 'con', 'en'];

    // Dividir por ":" para manejar subcategorías
    const parts = category.split(':').map(part => {
        return part
            .trim() // Eliminar espacios al inicio y final
            .replace(/\s+/g, ' ') // Eliminar espacios múltiples
            .split(' ')
            .map((word, index) => {
                // Convertir la palabra a minúsculas para la comparación
                const lowerWord = word.toLowerCase();

                // Si es una palabra que debe ir en minúscula y no es la primera palabra
                if (lowercaseWords.includes(lowerWord) && index !== 0) {
                    return lowerWord;
                }

                // Para el resto de palabras, primera letra mayúscula
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    });

    // Volver a unir las partes si había ":"
    return parts.join(': ');
}

async function scrapeJPMascota() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    let allProductsData = [];

    try {
        await page.goto('https://www.jpmascota.com/', { waitUntil: 'networkidle' });

        // Obtener categorías principales de ambas ubicaciones
        const mainCategories = await page.evaluate(() => {
            const categories = new Set(); // Usamos Set para evitar duplicados

            // Función helper para procesar menús
            const processMenus = (selector) => {
                document.querySelectorAll(selector).forEach(parent => {
                    const link = parent.querySelector('a');
                    const span = parent.querySelector('span');
                    if (link && span) {
                        categories.add({
                            name: span.textContent.trim(),
                            url: link.getAttribute('href')
                        });
                    }
                });
            };

            // Procesar ambas ubicaciones
            processMenus('.navleft-container.hidden-md-down .parentMenu');
            processMenus('.nav-container.hidden-md-down .parentMenu');

            return Array.from(categories);
        });

        console.log(`Categorías principales encontradas: ${mainCategories.length}`);

        for (const mainCategory of mainCategories) {
            const normalizedMainCategory = normalizeCategory(mainCategory.name);
            console.log(`\nProcesando categoría principal: ${normalizedMainCategory}`);

            await page.goto(mainCategory.url, { waitUntil: 'networkidle' });

            // Verificar si hay subcategorías
            const hasSubcategories = await page.evaluate(() => {
                return !!document.querySelector('.block-categories.hidden-sm-down .category-sub-menu');
            });

            if (hasSubcategories) {
                // Obtener subcategorías
                const subCategories = await page.evaluate((parentName) => {
                    const subLinks = document.querySelectorAll('.block-categories.hidden-sm-down .category-sub-menu a');
                    return Array.from(subLinks).map(link => ({
                        name: `${parentName}: ${link.textContent.trim()}`,
                        url: link.getAttribute('href')
                    }));
                }, normalizedMainCategory);

                // Procesar cada subcategoría
                for (const subCategory of subCategories) {
                    const normalizedSubCategory = normalizeCategory(subCategory.name);
                    console.log(`Procesando subcategoría: ${normalizedSubCategory}`);

                    let currentPage = 1;
                    let hasNextPage = true;

                    while (hasNextPage) {
                        const pageUrl = `${subCategory.url}?page=${currentPage}`;
                        console.log(`Visitando página ${currentPage}: ${pageUrl}`);

                        await page.goto(pageUrl, { waitUntil: 'networkidle' });

                        // Extraer productos de la página actual
                        const products = await page.evaluate((categoryName) => {
                            const items = [];
                            document.querySelectorAll('.products.row.product_content.grid .item-product').forEach(product => {
                                const imgBlock = product.querySelector('.img_block img');
                                const productName = product.querySelector('.product_desc .product_name');

                                if (imgBlock || productName) {
                                    items.push({
                                        nombre_producto: productName ? productName.textContent.trim() : null,
                                        imagen_url: imgBlock ? imgBlock.src : null,
                                        categoria: categoryName
                                    });
                                }
                            });
                            return items;
                        }, normalizedSubCategory);

                        if (products.length > 0) {
                            allProductsData.push(...products);
                            console.log(`Encontrados ${products.length} productos en la página ${currentPage}`);
                        }

                        // Verificar si existe siguiente página
                        hasNextPage = await page.evaluate(() => {
                            const nextButton = document.querySelector('a.next.js-search-link');
                            return nextButton && !nextButton.classList.contains('disabled');
                        });

                        if (hasNextPage) {
                            currentPage++;
                            await page.waitForTimeout(2000);
                        }
                    }
                }
            } else {
                // Procesar la categoría principal directamente
                let currentPage = 1;
                let hasNextPage = true;

                while (hasNextPage) {
                    const pageUrl = `${mainCategory.url}?page=${currentPage}`;
                    console.log(`Visitando página ${currentPage}: ${pageUrl}`);

                    await page.goto(pageUrl, { waitUntil: 'networkidle' });

                    // Extraer productos de la página actual
                    const products = await page.evaluate((categoryName) => {
                        const items = [];
                        document.querySelectorAll('.products.row.product_content.grid .item-product').forEach(product => {
                            const imgBlock = product.querySelector('.img_block img');
                            const productName = product.querySelector('.product_desc .product_name');

                            if (imgBlock || productName) {
                                items.push({
                                    nombre_producto: productName ? productName.textContent.trim() : null,
                                    imagen_url: imgBlock ? imgBlock.src : null,
                                    categoria: categoryName
                                });
                            }
                        });
                        return items;
                    }, normalizedMainCategory);

                    if (products.length > 0) {
                        allProductsData.push(...products);
                        console.log(`Encontrados ${products.length} productos en la página ${currentPage}`);
                    }

                    // Verificar si existe siguiente página
                    hasNextPage = await page.evaluate(() => {
                        const nextButton = document.querySelector('a.next.js-search-link');
                        return nextButton && !nextButton.classList.contains('disabled');
                    });

                    if (hasNextPage) {
                        currentPage++;
                        await page.waitForTimeout(2000);
                    }
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
            // Guardar JSON final
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
