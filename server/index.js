require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const apiRouter = express.Router();

// Application initialization
const app = express();
app.use(express.static('public'));
app.use(cors());
app.use('/images', express.static(path.join(__dirname, 'images')));

// Configuration
const PORT = process.env.PORT || 5000;
const VALID_FACTIONS = ['Warden', 'Colonial', 'Neutral'];

// Helper functions
const toSnakeCase = (str) => str.replace(/\s+/g, '_').toLowerCase();

const buildItemIconUrl = (icon, categoryName) => 
  icon ? `/images/items/${toSnakeCase(categoryName)}/${icon}` : null;

const buildMaterialIconUrl = (icon) => 
  icon ? `/images/materials/${icon}` : null;

// Error handling
const handleServerError = (res, error, context) => {
  console.error(`Error during ${context}:`, error);
  res.status(500).json({ error: 'Internal server error' });
};

// String normalization
const normalizeString = (str) => {
  if (!str) return str;
  
  // Convert snake_case and kebab-case to spaces
  let normalized = str.replace(/[_-]/g, ' ');
  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  // Convert to lowercase for comparison
  return normalized.toLowerCase();
};

// Faction matching
const matchFaction = (inputFaction) => {
  const normalizedInput = normalizeString(inputFaction);
  return VALID_FACTIONS.find(faction => 
    normalizeString(faction) === normalizedInput
  );
};

// Category matching
const matchCategory = async (inputCategory) => {
  const normalizedInput = normalizeString(inputCategory);
  // Get all categories from database
  const result = await db.query('SELECT name FROM category');
  return result.rows.find(category => 
    normalizeString(category.name) === normalizedInput
  )?.name;
};

// Controllers
const itemController = {
  getAllItems: async (req, res) => {
    try {
      const itemsQuery = `
        SELECT i.id, i.name, i.faction, i.icon, 
               i.production_time_seconds, i.quantity_per_crate,
               c.name AS category_name
        FROM item i
        JOIN category c ON i.category_id = c.id
      `;
      
      const materialsQuery = `
        SELECT im.item_id, m.id AS material_id, m.name AS material_name,
               m.icon AS material_icon, im.quantity AS material_quantity
        FROM item_material im
        JOIN material m ON im.material_id = m.id
        ORDER BY im.item_id
      `;

      const [itemsResult, materialsResult] = await Promise.all([
        db.query(itemsQuery),
        db.query(materialsQuery)
      ]);

      // Group materials by item ID
      const materialsByItem = materialsResult.rows.reduce((acc, material) => {
        const materialData = {
          id: material.material_id,
          name: material.material_name,
          icon: material.material_icon,
          iconUrl: buildMaterialIconUrl(material.material_icon),
          quantity: material.material_quantity
        };
        
        acc[material.item_id] = acc[material.item_id] || [];
        acc[material.item_id].push(materialData);
        return acc;
      }, {});

      // Add materials to items
      const itemsWithMaterials = itemsResult.rows.map(item => ({
        ...item,
        iconUrl: buildItemIconUrl(item.icon, item.category_name),
        materials: materialsByItem[item.id] || []
      }));

      res.json(itemsWithMaterials);
    } catch (err) {
      handleServerError(res, err, 'fetching items');
    }
  },

  getItemById: async (req, res) => {
    try {
      const itemId = req.params.id;
      const [itemResult, materialsResult] = await Promise.all([
        db.query(`
          SELECT i.id, i.name, i.faction, i.icon, 
                 i.production_time_seconds, i.quantity_per_crate,
                 c.name AS category_name
          FROM item i
          JOIN category c ON i.category_id = c.id
          WHERE i.id = $1
        `, [itemId]),
        
        db.query(`
          SELECT m.id, m.name, m.icon, im.quantity
          FROM item_material im
          JOIN material m ON im.material_id = m.id
          WHERE im.item_id = $1
        `, [itemId])
      ]);

      if (itemResult.rows.length === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const item = itemResult.rows[0];
      const materials = materialsResult.rows.map(material => ({
        ...material,
        iconUrl: buildMaterialIconUrl(material.icon)
      }));

      res.json({
        ...item,
        iconUrl: buildItemIconUrl(item.icon, item.category_name),
        materials
      });
    } catch (err) {
      handleServerError(res, err, 'fetching item');
    }
  },

  getItemsByFaction: async (req, res) => {
    try {
      const { faction: inputFaction } = req.params;
      const includeNeutral = req.query.includeNeutral === 'true';

      // Find matching faction in VALID_FACTIONS
      const faction = matchFaction(inputFaction);
      
      if (!faction) {
        return res.status(400).json({ 
          error: `Invalid faction. Valid values: ${VALID_FACTIONS.join(', ')}` 
        });
      }

      let query;
      let params = [faction];

      if (faction === 'Neutral') {
        query = `
          SELECT i.id, i.name, i.faction, i.icon, 
                 i.production_time_seconds, i.quantity_per_crate,
                 c.name AS category_name
          FROM item i
          JOIN category c ON i.category_id = c.id
          WHERE i.faction = $1
        `;
      } else {
        query = `
          SELECT i.id, i.name, i.faction, i.icon, 
                 i.production_time_seconds, i.quantity_per_crate,
                 c.name AS category_name
          FROM item i
          JOIN category c ON i.category_id = c.id
          WHERE i.faction = $1 ${includeNeutral ? 'OR i.faction = $2' : ''}
        `;
        if (includeNeutral) params.push('Neutral');
      }

      const result = await db.query(query, params);
      
      // Process each item to add materials
      const itemsWithDetails = await Promise.all(
        result.rows.map(async item => {
          const materialsResult = await db.query(`
            SELECT m.id, m.name, m.icon, im.quantity
            FROM item_material im
            JOIN material m ON im.material_id = m.id
            WHERE im.item_id = $1
          `, [item.id]);

          const materials = materialsResult.rows.map(material => ({
            ...material,
            iconUrl: buildMaterialIconUrl(material.icon)
          }));

          return {
            ...item,
            iconUrl: buildItemIconUrl(item.icon, item.category_name),
            materials
          };
        })
      );

      res.json(itemsWithDetails);
    } catch (err) {
      handleServerError(res, err, 'fetching items by faction');
    }
  },

  getItemsByCategory: async (req, res) => {
    try {
      const { category: inputCategory } = req.params;
      const { faction: inputFaction } = req.query;

      // Find matching category in database
      const category = await matchCategory(inputCategory);
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      // Build query
      let query = `
        SELECT i.id, i.name, i.faction, i.icon, 
               i.production_time_seconds, i.quantity_per_crate,
               c.name AS category_name
        FROM item i
        JOIN category c ON i.category_id = c.id
        WHERE c.name = $1
      `;
      
      let params = [category];

      if (inputFaction) {
        const faction = matchFaction(inputFaction);
        if (faction) {
          query += ' AND i.faction = $2';
          params.push(faction);
        }
      }

      const result = await db.query(query, params);
      
      // Process each item to add materials
      const itemsWithDetails = await Promise.all(
        result.rows.map(async item => {
          const materialsResult = await db.query(`
            SELECT m.id, m.name, m.icon, im.quantity
            FROM item_material im
            JOIN material m ON im.material_id = m.id
            WHERE im.item_id = $1
          `, [item.id]);

          const materials = materialsResult.rows.map(material => ({
            ...material,
            iconUrl: buildMaterialIconUrl(material.icon)
          }));

          return {
            ...item,
            iconUrl: buildItemIconUrl(item.icon, item.category_name),
            materials
          };
        })
      );

      res.json(itemsWithDetails);
    } catch (err) {
      handleServerError(res, err, 'fetching items by category');
    }
  },

  getItemMaterials: async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query(`
        SELECT m.id, m.name, m.icon, im.quantity
        FROM item_material im
        JOIN material m ON im.material_id = m.id
        WHERE im.item_id = $1
      `, [id]);

      const materialsWithIcons = result.rows.map(material => ({
        ...material,
        iconUrl: buildMaterialIconUrl(material.icon)
      }));

      res.json(materialsWithIcons);
    } catch (err) {
      handleServerError(res, err, 'fetching item materials');
    }
  }
};

// Material controller
const materialController = {
  getAllMaterials: async (req, res) => {
    try {
      const result = await db.query(`
        SELECT id, name, icon
        FROM material
        ORDER BY name
      `);

      const materialsWithIcons = result.rows.map(material => ({
        ...material,
        iconUrl: buildMaterialIconUrl(material.icon)
      }));

      res.json(materialsWithIcons);
    } catch (err) {
      handleServerError(res, err, 'fetching materials list');
    }
  }
};

// Faction controller
const factionController = {
  getAllFactions: async (req, res) => {
    try {
      const result = await db.query('SELECT DISTINCT faction FROM item');
      res.json(result.rows);
    } catch (err) {
      handleServerError(res, err, 'fetching factions list');
    }
  }
};

// Category controller
const categoryController = {
  getAllCategories: async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM category');
      res.json(result.rows);
    } catch (err) {
      handleServerError(res, err, 'fetching categories list');
    }
  }
};

// API Routes
apiRouter.get('/items', itemController.getAllItems);
apiRouter.get('/items/:id', itemController.getItemById);
apiRouter.get('/items/faction/:faction', itemController.getItemsByFaction);
apiRouter.get('/items/category/:category', itemController.getItemsByCategory);
apiRouter.get('/items/:id/materials', itemController.getItemMaterials);

apiRouter.get('/factions', factionController.getAllFactions);
apiRouter.get('/categories', categoryController.getAllCategories);
apiRouter.get('/materials', materialController.getAllMaterials);

// Use router for all routes starting with /api
app.use('/api', apiRouter);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});