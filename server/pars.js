const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');
const { URL } = require('url');
require('dotenv').config();

// Configure logging
const log = require('simple-node-logger').createSimpleLogger({
    logFilePath: 'foxhole_parser.log',
    timestampFormat: 'YYYY-MM-DD HH:mm:ss'
});
log.setLevel('info');

// Database configuration
const DB_CONFIG = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
};

// Factions mapping
const FACTIONS = {
    'Warden': 'Warden',
    'Colonial': 'Colonial',
    'Общее': 'Neutral'
};

/**
 * Helper Functions
 */
const toSnakeCase = (name) => name.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');

/**
 * Creates the database structure if it doesn't exist
 */
async function createDatabase() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    
    try {
        log.info("Creating database tables if they don't exist...");
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS category (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS material (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                icon TEXT
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS item (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                icon TEXT,
                category_id INTEGER REFERENCES category(id),
                production_time_seconds INTEGER NOT NULL,
                quantity_per_crate INTEGER NOT NULL,
                faction TEXT
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS item_material (
                item_id INTEGER NOT NULL REFERENCES item(id),
                material_id INTEGER NOT NULL REFERENCES material(id),
                quantity INTEGER NOT NULL,
                PRIMARY KEY (item_id, material_id)
            );
        `);
        
        await client.query(`
            CREATE OR REPLACE VIEW item_full_info AS
            SELECT 
                i.id,
                i.name AS item_name,
                i.icon,
                c.name AS category,
                i.production_time_seconds,
                i.quantity_per_crate,
                i.faction,
                string_agg(m.name || ' (' || im.quantity || ')', ', ' ORDER BY m.name) AS materials
            FROM item i
            LEFT JOIN category c ON i.category_id = c.id
            LEFT JOIN item_material im ON i.id = im.item_id
            LEFT JOIN material m ON im.material_id = m.id
            GROUP BY i.id, i.name, i.icon, c.name, i.production_time_seconds, i.quantity_per_crate, i.faction;
        `);
        
        log.info("Database tables created successfully");
    } catch (error) {
        log.error(`Error creating database structure: ${error.message}`);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

/**
 * Downloads the factory page from the wiki
 */
async function downloadFactoryPage() {
    const url = "https://foxhole.wiki.gg/wiki/Factory";
    try {
        log.info(`Downloading factory page from ${url}`);
        const response = await axios.get(url);
        
        // Save the HTML content to a file
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const filePath = path.join(dataDir, 'factory.html');
        fs.writeFileSync(filePath, response.data, 'utf8');
        
        log.info(`Factory page saved to ${filePath}`);
        return filePath;
    } catch (error) {
        log.error(`Error downloading factory page: ${error.message}`);
        throw error;
    }
}

/**
 * Parses a time string (HH:MM:SS or MM:SS) into seconds
 */
function parseTime(timeStr) {
    try {
        const parts = timeStr.split(':');
        if (parts.length === 3) {
            const [h, m, s] = parts.map(Number);
            return h * 3600 + m * 60 + s;
        } else if (parts.length === 2) {
            const [m, s] = parts.map(Number);
            return m * 60 + s;
        }
        return 0;
    } catch (error) {
        log.warning(`Failed to parse time: ${timeStr}`);
        return 0;
    }
}

/**
 * Parses materials from HTML content
 */
function parseMaterials(materialsHtml) {
    const $ = cheerio.load(materialsHtml);
    const materials = [];
    
    // Split by <br> tags
    const parts = materialsHtml.split('<br>').map(part => part.trim()).filter(part => part);
    
    for (const part of parts) {
        try {
            const part$ = cheerio.load(part);
            const text = part$.text().trim();
            
            if (!text) continue;
            
            // Find quantity (can be in format "100 x" or "100x")
            const quantityMatch = text.match(/(\d+)\s*x\s*/i) || text.match(/^(\d+)/);
            if (!quantityMatch) continue;
            
            const quantity = parseInt(quantityMatch[1]);
            
            // Material name - text after "x" or next part
            let materialName = text.slice(quantityMatch[0].length).trim();
            
            // If name is empty, try to get from title attribute
            if (!materialName) {
                const link = part$('a[title]').first();
                if (link.length) {
                    materialName = link.attr('title');
                }
            }
            
            if (!materialName) continue;
            
            // Special case for Barbed Wire (Material)
            if (materialName.includes('Barbed Wire') && !materialName.includes('Structure')) {
                materialName = 'Barbed Wire (Material)';
            }
            
            // Find icon
            let icon = null;
            const link = part$('a[title]').first();
            if (link.length) {
                const img = link.find('img').first();
                if (img.length && img.attr('src')) {
                    icon = img.attr('src');
                    if (!icon.startsWith('http')) {
                        icon = `https://foxhole.wiki.gg${icon}`;
                    }
                }
            }
            
            materials.push({
                name: materialName,
                quantity,
                icon
            });
        } catch (error) {
            log.warning(`Failed to parse material: ${part}. Error: ${error.message}`);
        }
    }
    
    return materials;
}

/**
 * Parses output information from HTML
 */
function parseOutput(outputHtml) {
    try {
        const $ = cheerio.load(outputHtml);
        const text = $.text().trim();
        
        if (!text) return null;
        
        // Initialize defaults
        let quantityPerCrate = 1;
        let itemName = null;
        let icon = null;
        
        // Pattern to match: "1 crate of 100 x Maintenance Supplies"
        const cratePattern = /1\s*crate\s*of\s*(\d+)\s*x\s*(.+)/i;
        
        // Try to match the crate pattern
        let match = text.match(cratePattern);
        if (match) {
            quantityPerCrate = parseInt(match[1]);
            itemName = match[2].trim();
        } else {
            // If no quantity pattern, use full text as item name
            itemName = text;
        }
        
        // Clean up item name (remove any remaining "x N" prefix)
        itemName = itemName.replace(/^\d+\s*x\s*/, '').trim();
        
        // Find icon
        const link = $('a[title]').first();
        if (link.length) {
            const img = link.find('img').first();
            if (img.length && img.attr('src')) {
                icon = img.attr('src');
                if (!icon.startsWith('http')) {
                    icon = `https://foxhole.wiki.gg${icon}`;
                }
            }
        }
        
        return {
            name: itemName,
            quantityPerCrate,
            icon
        };
    } catch (error) {
        log.error(`Failed to parse output: ${outputHtml}. Error: ${error.message}`);
        return null;
    }
}

/**
 * Parses the HTML file and extracts production data
 */
async function parseHtmlFile(filePath) {
    log.info(`Starting to parse file: ${filePath}`);
    
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File ${filePath} not found`);
        }
        
        const htmlContent = fs.readFileSync(filePath, 'utf8');
        const $ = cheerio.load(htmlContent);
        const parsedData = [];
        
        // Find all faction tabs
        const factionTabs = $('header.tabber__header nav.tabber__tabs > a.tabber__tab');
        
        for (let i = 0; i < factionTabs.length; i++) {
            const tab = factionTabs.eq(i);
            const factionName = tab.text().trim();
            
            if (!FACTIONS[factionName]) continue;
            
            const faction = FACTIONS[factionName];
            log.info(`Processing faction: ${faction}`);
            
            // Find content panel for this faction
            const panelId = tab.attr('href').substring(1);
            const factionPanel = $(`article#${panelId}`);
            if (!factionPanel.length) continue;
            
            // Inside faction panel find category tabs
            const categoryTabs = factionPanel.find('header.tabber__header nav.tabber__tabs > a.tabber__tab');
            
            for (let j = 0; j < categoryTabs.length; j++) {
                const catTab = categoryTabs.eq(j);
                const categoryName = catTab.text().trim();
                log.info(`Processing category: ${categoryName}`);
                
                // Find panel with table for this category
                const catPanelId = catTab.attr('href').substring(1);
                const catPanel = factionPanel.find(`article#${catPanelId}`);
                if (!catPanel.length) continue;
                
                // Find table in category panel
                const table = catPanel.find('table.wikitable');
                if (!table.length) continue;
                
                // Parse table rows (skip header)
                const rows = table.find('tr').slice(1);
                
                rows.each((index, row) => {
                    const cols = $(row).find('td');
                    if (cols.length !== 3) return;
                    
                    const inputs = cols.eq(0).html();
                    const outputs = cols.eq(1).html();
                    const time = cols.eq(2).text().trim();
                    
                    // Parse input materials
                    const inputMaterials = parseMaterials(inputs);
                    
                    // Parse output item
                    const outputInfo = parseOutput(outputs);
                    if (!outputInfo) return;
                    
                    // Parse production time
                    const productionTime = parseTime(time);
                    
                    // Add data to list
                    parsedData.push({
                        category: categoryName,
                        faction,
                        inputMaterials,
                        outputItem: outputInfo,
                        productionTime
                    });
                });
            }
        }
        
        log.info(`Successfully parsed ${parsedData.length} records`);
        return parsedData;
    } catch (error) {
        log.error(`Error parsing file: ${error.message}`);
        throw error;
    }
}

/**
 * Inserts parsed data into the database
 */
async function insertDataToDb(parsedData) {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    
    try {
        // Create dictionaries to store IDs
        const categoryIds = {};
        const materialIds = {};
        const itemIds = {};
        
        log.info("Starting to insert data into database");
        
        // Insert categories (with existence check)
        const categories = [...new Set(parsedData.map(item => item.category))];
        
        for (const category of categories) {
            // Check if category already exists
            const res = await client.query('SELECT id FROM category WHERE name = $1;', [category]);
            
            if (res.rows.length > 0) {
                categoryIds[category] = res.rows[0].id;
                log.debug(`Category already exists: ${category} (ID: ${res.rows[0].id})`);
            } else {
                const insertRes = await client.query(
                    'INSERT INTO category (name) VALUES ($1) RETURNING id;',
                    [category]
                );
                categoryIds[category] = insertRes.rows[0].id;
                log.debug(`Added category: ${category} (ID: ${insertRes.rows[0].id})`);
            }
        }
        
        // Insert materials (with existence check)
        const materials = new Set();
        parsedData.forEach(item => {
            item.inputMaterials.forEach(material => {
                materials.add(JSON.stringify({ name: material.name, icon: material.icon }));
            });
        });
        
        for (const material of materials) {
            const { name, icon } = JSON.parse(material);
            
            const res = await client.query('SELECT id FROM material WHERE name = $1;', [name]);
            
            if (res.rows.length > 0) {
                materialIds[name] = res.rows[0].id;
                log.debug(`Material already exists: ${name} (ID: ${res.rows[0].id})`);
            } else {
                const insertRes = await client.query(
                    'INSERT INTO material (name, icon) VALUES ($1, $2) RETURNING id;',
                    [name, icon]
                );
                materialIds[name] = insertRes.rows[0].id;
                log.debug(`Added material: ${name} (ID: ${insertRes.rows[0].id})`);
            }
        }
        
        // Collect information about all items
        const itemsInfo = {};
        
        parsedData.forEach(item => {
            const output = item.outputItem;
            if (!itemsInfo[output.name]) {
                itemsInfo[output.name] = {
                    name: output.name,
                    icon: output.icon,
                    category: item.category,
                    factions: new Set(),
                    productionTimes: new Set(),
                    quantities: new Set(),
                    inputMaterials: []
                };
            }
            
            itemsInfo[output.name].factions.add(item.faction);
            itemsInfo[output.name].productionTimes.add(item.productionTime);
            itemsInfo[output.name].quantities.add(output.quantityPerCrate);
            itemsInfo[output.name].inputMaterials.push(...item.inputMaterials);
        });
        
        // Insert items
        for (const [itemName, itemData] of Object.entries(itemsInfo)) {
            // Determine faction
            let faction;
            if (itemData.factions.size > 1) {
                faction = 'Neutral';
            } else {
                faction = [...itemData.factions][0];
            }
            
            // Calculate average production time
            const avgProductionTime = Math.floor(
                [...itemData.productionTimes].reduce((a, b) => a + b, 0) / itemData.productionTimes.size
            );
            
            // Use the most common quantity
            const quantities = [...itemData.quantities];
            const mostCommonQuantity = quantities.sort(
                (a, b) => quantities.filter(v => v === a).length - quantities.filter(v => v === b).length
            ).pop();
            
            // Check if item exists
            const res = await client.query('SELECT id FROM item WHERE name = $1;', [itemName]);
            let itemId;
            
            if (res.rows.length > 0) {
                itemId = res.rows[0].id;
                log.debug(`Item already exists: ${itemName} (ID: ${itemId})`);
            } else {
                const insertRes = await client.query(
                    `INSERT INTO item (name, icon, category_id, production_time_seconds, quantity_per_crate, faction)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
                    [
                        itemName,
                        itemData.icon,
                        categoryIds[itemData.category],
                        avgProductionTime,
                        mostCommonQuantity,
                        faction
                    ]
                );
                itemId = insertRes.rows[0].id;
                log.debug(`Added item: ${itemName} (ID: ${itemId})`);
            }
            
            itemIds[itemName] = itemId;
            
            // Insert material relationships
            const uniqueMaterials = {};
            itemData.inputMaterials.forEach(material => {
                if (!uniqueMaterials[material.name]) {
                    uniqueMaterials[material.name] = material.quantity;
                } else {
                    // Average quantities if multiple entries
                    uniqueMaterials[material.name] = Math.floor(
                        (uniqueMaterials[material.name] + material.quantity) / 2
                    );
                }
            });
            
            for (const [materialName, quantity] of Object.entries(uniqueMaterials)) {
                try {
                    await client.query(
                        `INSERT INTO item_material (item_id, material_id, quantity)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (item_id, material_id) DO NOTHING;`,
                        [itemId, materialIds[materialName], quantity]
                    );
                } catch (error) {
                    log.warning(`Failed to add material ${materialName} for item ${itemName}: ${error.message}`);
                }
            }
        }
        
        log.info("Data successfully loaded into database");
    } catch (error) {
        log.error(`Error inserting data into database: ${error.message}`);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

/**
 * Downloads images for items and materials
 */
async function downloadImages() {
    const pool = new Pool(DB_CONFIG);
    const client = await pool.connect();
    
    try {
        // Create base images directory structure
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Create subdirectories
        const itemDir = path.join(imagesDir, 'items');
        const materialDir = path.join(imagesDir, 'materials');
        
        if (!fs.existsSync(itemDir)) fs.mkdirSync(itemDir, { recursive: true });
        if (!fs.existsSync(materialDir)) fs.mkdirSync(materialDir, { recursive: true });
        
        // Process ITEMS first
        const itemsRes = await client.query("SELECT id, name, category_id FROM item");
        
        for (const row of itemsRes.rows) {
            const { id: itemId, name: itemName, category_id: categoryId } = row;
            
            try {
                // Get category name for directory structure
                const categoryRes = await client.query("SELECT name FROM category WHERE id = $1", [categoryId]);
                const categoryName = categoryRes.rows[0].name;
                const categoryDir = toSnakeCase(categoryName);
                
                // Create category directory if it doesn't exist
                const categoryPath = path.join(itemDir, categoryDir);
                if (!fs.existsSync(categoryPath)) {
                    fs.mkdirSync(categoryPath, { recursive: true });
                }
                
                // Special case for Barbed Wire (Material) - it's actually an item
                let url;
                if (itemName.includes('Barbed Wire') && !itemName.includes('Structure')) {
                    url = "https://foxhole.wiki.gg/wiki/Barbed_Wire_(Material)";
                } else {
                    // Generate Wikipedia URL
                    const urlName = itemName.replace(/ /g, '_');
                    const urlNameEncoded = encodeURIComponent(urlName);
                    url = `https://foxhole.wiki.gg/wiki/${urlNameEncoded}`;
                }
                
                // Fetch page
                const response = await axios.get(url);
                
                // Parse HTML
                const $ = cheerio.load(response.data);
                
                // Try both possible image container structures
                let imgSrc;
                const floatnoneDivs = $('div.floatnone');
                const piDataValueDivs = $('div.pi-data-value.pi-font');
                
                // First try the new structure (pi-data-value)
                if (piDataValueDivs.length > 0) {
                    const imgContainer = piDataValueDivs.find('div[style*="background-color"]');
                    if (imgContainer.length > 0) {
                        const img = imgContainer.find('img').first();
                        if (img.length && img.attr('src')) {
                            imgSrc = img.attr('src');
                        }
                    }
                }
                
                // If not found in new structure, try the old one (floatnone)
                if (!imgSrc && floatnoneDivs.length > 0) {
                    const div = floatnoneDivs.first();
                    const img = div.find('img').first();
                    if (img.length && img.attr('src')) {
                        imgSrc = img.attr('src');
                    }
                }
                
                if (!imgSrc) {
                    log.warn(`No image found for item ${itemName}`);
                    continue;
                }
                
                // Extract filename
                const parsedUrl = new URL(imgSrc, url);
                const pathParts = parsedUrl.pathname.split('/');
                let filename = pathParts[pathParts.length - 1];
                
                if (!filename) {
                    log.warn(`Invalid image path for item ${itemName}`);
                    continue;
                }
                
                // Handle size prefix in filename
                let actualFilename;
                if (filename.includes('-')) {
                    actualFilename = filename.split('-').slice(1).join('-');
                } else {
                    actualFilename = filename;
                }
                
                // Get full image URL
                const imageUrl = new URL(imgSrc, url).toString();
                
                // Download image
                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                
                // Save to appropriate directory
                const savePath = path.join(categoryPath, actualFilename);
                fs.writeFileSync(savePath, imgResponse.data);
                
                // Update database
                await client.query(
                    "UPDATE item SET icon = $1 WHERE id = $2",
                    [actualFilename, itemId]
                );
                
                log.info(`Processed item ${itemName} - Saved to ${savePath}`);
            } catch (error) {
                log.error(`Error processing item ${itemName}: ${error.message}`);
                continue;
            }
        }
        
        // Now process MATERIALS
        const materialsRes = await client.query("SELECT id, name FROM material");
        
        for (const row of materialsRes.rows) {
            const { id: materialId, name: materialName } = row;
            
            try {
                // Generate Wikipedia URL
                let urlName = materialName.replace(/ /g, '_');
                
                // Handle special characters in material names
                if (materialName.includes('(') && materialName.includes(')')) {
                    // For names like "Barbed Wire (Material)" we need to encode the parentheses
                    const baseName = materialName.split(' (')[0];
                    urlName = `${baseName}_(Material)`;
                }
                
                const urlNameEncoded = encodeURIComponent(urlName);
                const url = `https://foxhole.wiki.gg/wiki/${urlNameEncoded}`;
                
                // Fetch page
                const response = await axios.get(url);
                
                // Parse HTML
                const $ = cheerio.load(response.data);
                
                // Try both possible image container structures
                let imgSrc;
                const floatnoneDivs = $('div.floatnone');
                const piDataValueDivs = $('div.pi-data-value.pi-font');
                
                // First try the new structure (pi-data-value)
                if (piDataValueDivs.length > 0) {
                    const imgContainer = piDataValueDivs.find('div[style*="background-color"]');
                    if (imgContainer.length > 0) {
                        const img = imgContainer.find('img').first();
                        if (img.length && img.attr('src')) {
                            imgSrc = img.attr('src');
                        }
                    }
                }
                
                // If not found in new structure, try the old one (floatnone)
                if (!imgSrc && floatnoneDivs.length > 0) {
                    const div = floatnoneDivs.first();
                    const img = div.find('img').first();
                    if (img.length && img.attr('src')) {
                        imgSrc = img.attr('src');
                    }
                }
                
                if (!imgSrc) {
                    log.warn(`No image found for material ${materialName}`);
                    continue;
                }
                
                // Extract filename
                const parsedUrl = new URL(imgSrc, url);
                const pathParts = parsedUrl.pathname.split('/');
                let filename = pathParts[pathParts.length - 1];
                
                if (!filename) {
                    log.warn(`Invalid image path for material ${materialName}`);
                    continue;
                }
                
                // Handle size prefix in filename
                let actualFilename;
                if (filename.includes('-')) {
                    actualFilename = filename.split('-').slice(1).join('-');
                } else {
                    actualFilename = filename;
                }
                
                // Get full image URL
                const imageUrl = new URL(imgSrc, url).toString();
                
                // Download image
                const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                
                // Save to materials directory
                const savePath = path.join(materialDir, actualFilename);
                fs.writeFileSync(savePath, imgResponse.data);
                
                // Update database
                await client.query(
                    "UPDATE material SET icon = $1 WHERE id = $2",
                    [actualFilename, materialId]
                );
                
                log.info(`Processed material ${materialName} - Saved to ${savePath}`);
            } catch (error) {
                log.error(`Error processing material ${materialName}: ${error.message}`);
                continue;
            }
        }
    } catch (error) {
        log.error(`Error downloading images: ${error.message}`);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

/**
 * Main function to execute the parsing process
 */
async function main() {
    try {
        log.info("Starting Foxhole data parser");
        
        // Step 1: Create database structure
        await createDatabase();
        
        // Step 2: Download factory page
        const htmlFile = await downloadFactoryPage();
        
        // Step 3: Parse data from HTML
        const parsedData = await parseHtmlFile(htmlFile);
        
        // Step 4: Insert data into database
        await insertDataToDb(parsedData);
        
        // Step 5: Download item and material images
        await downloadImages();
        
        log.info("Script completed successfully");
    } catch (error) {
        log.error(`Critical error: ${error.message}`);
        process.exit(1);
    }
}

main();