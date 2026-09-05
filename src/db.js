import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../agent_passport.db');

const db = new sqlite3.Database(dbPath);

// Helper wrapper for async sqlite queries
export const dbQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

export const initDb = async () => {
  // Create merchants table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS merchants (
      merchant_id TEXT PRIMARY KEY,
      merchant_name TEXT NOT NULL,
      auto_approve_ceiling_inr REAL NOT NULL,
      human_approval_ceiling_inr REAL NOT NULL,
      velocity_limit INTEGER NOT NULL DEFAULT 5,
      blocked_skus TEXT NOT NULL,
      allowed_buyer_agent_ids TEXT NOT NULL
    )
  `);

  // Create products table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS products (
      sku TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      price_inr REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      stock_qty INTEGER NOT NULL,
      category TEXT,
      image_url TEXT,
      gtin TEXT,
      razorpay_item_id TEXT,
      FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
    )
  `);

  // Create audit_events table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS audit_events (
      event_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      buyer_agent_id TEXT NOT NULL,
      protocol TEXT NOT NULL,
      sku TEXT NOT NULL,
      qty INTEGER NOT NULL,
      declared_total_inr REAL NOT NULL,
      decision TEXT NOT NULL,
      matched_rule TEXT NOT NULL,
      reason TEXT,
      trace TEXT,
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      human_approval_link TEXT,
      FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
    )
  `);

  // Auto-migrate schema for existing SQLite databases
  try {
    await dbRun(`ALTER TABLE audit_events ADD COLUMN trace TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    await dbRun(`ALTER TABLE audit_events ADD COLUMN razorpay_payment_id TEXT`);
  } catch (e) {
    // Column already exists
  }

  try {
    await dbRun(`ALTER TABLE merchants ADD COLUMN velocity_limit INTEGER NOT NULL DEFAULT 5`);
  } catch (e) {
    // Column already exists
  }

  // Create upi_consents table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS upi_consents (
      consent_id TEXT PRIMARY KEY,
      buyer_agent_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      spending_cap_inr REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
    )
  `);

  // Seed merchant if empty
  const merchantCount = await dbGet(`SELECT COUNT(*) as count FROM merchants`);
  if (merchantCount.count === 0) {
    await dbRun(
      `INSERT INTO merchants (merchant_id, merchant_name, auto_approve_ceiling_inr, human_approval_ceiling_inr, velocity_limit, blocked_skus, allowed_buyer_agent_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'merchant_001',
        'Demo Kirana Store',
        3000,
        5000,
        5,
        JSON.stringify([]),
        JSON.stringify(['*'])
      ]
    );
    console.log('✅ Seeded default merchant: merchant_001 (Demo Kirana Store)');
  }

  // Seed products if empty
  const productCount = await dbGet(`SELECT COUNT(*) as count FROM products`);
  if (productCount.count === 0) {
    await seedProductsList();
  }
};

const seedProductsList = async () => {
  const seedProducts = [
    {
      sku: 'SKU-001',
      merchant_id: 'merchant_001',
      title: 'Organic Basmati Rice 5kg',
      description: 'Premium aged basmati rice, 5kg pack',
      price_inr: 899,
      currency: 'INR',
      stock_qty: 42,
      category: 'grocery',
      image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500',
      gtin: '8901234567890',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-002',
      merchant_id: 'merchant_001',
      title: 'Tata Tea Gold Premium 500g',
      description: 'Rich liquid gold tea leaves with fine aroma',
      price_inr: 340,
      currency: 'INR',
      stock_qty: 100,
      category: 'beverages',
      image_url: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500',
      gtin: '8901058002314',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-003',
      merchant_id: 'merchant_001',
      title: 'Aashirvaad Shudh Chakki Atta 10kg',
      description: '100% pure whole wheat flour',
      price_inr: 445,
      currency: 'INR',
      stock_qty: 25,
      category: 'staples',
      image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500',
      gtin: '8901058852308',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-004',
      merchant_id: 'merchant_001',
      title: 'Fortune Sunlite Sunflower Oil 1L',
      description: 'Refined sunflower oil, rich in vitamins',
      price_inr: 155,
      currency: 'INR',
      stock_qty: 60,
      category: 'edible-oil',
      image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500',
      gtin: '8906007280014',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-005',
      merchant_id: 'merchant_001',
      title: 'Amul Butter Pasteurized 500g',
      description: 'Delicious pasteurized butter pack',
      price_inr: 275,
      currency: 'INR',
      stock_qty: 15,
      category: 'dairy',
      image_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=500',
      gtin: '8901262010057',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-006',
      merchant_id: 'merchant_001',
      title: 'Everest Garam Masala 100g',
      description: 'Authentic blend of aromatic spices',
      price_inr: 92,
      currency: 'INR',
      stock_qty: 80,
      category: 'spices',
      image_url: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=500',
      gtin: '8901786081007',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-007',
      merchant_id: 'merchant_001',
      title: 'Dabur Honey 500g',
      description: '100% pure natural honey squeeze pack',
      price_inr: 220,
      currency: 'INR',
      stock_qty: 35,
      category: 'wellness',
      image_url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500',
      gtin: '8901207000259',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-008',
      merchant_id: 'merchant_001',
      title: 'Maggi 2-Minute Noodles 12-Pack',
      description: 'Instant masala noodles pack of 12',
      price_inr: 168,
      currency: 'INR',
      stock_qty: 50,
      category: 'instant-food',
      image_url: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=500',
      gtin: '8901058864103',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-009',
      merchant_id: 'merchant_001',
      title: 'Cadbury Dairy Milk Silk 150g',
      description: 'Smooth chocolate bar for special moments',
      price_inr: 175,
      currency: 'INR',
      stock_qty: 40,
      category: 'confectionery',
      image_url: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=500',
      gtin: '8901233020015',
      razorpay_item_id: null
    },
    {
      sku: 'SKU-010',
      merchant_id: 'merchant_001',
      title: 'Surf Excel Easy Wash Detergent Powder 1kg',
      description: 'Tough stain removal detergent powder',
      price_inr: 140,
      currency: 'INR',
      stock_qty: 30,
      category: 'household',
      image_url: 'https://images.unsplash.com/photo-1585842378054-ee2e52f94ba2?w=500',
      gtin: '8901030678910',
      razorpay_item_id: null
    }
  ];

  for (const p of seedProducts) {
    await dbRun(
      `INSERT INTO products (sku, merchant_id, title, description, price_inr, currency, stock_qty, category, image_url, gtin, razorpay_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.sku,
        p.merchant_id,
        p.title,
        p.description,
        p.price_inr,
        p.currency,
        p.stock_qty,
        p.category,
        p.image_url,
        p.gtin,
        p.razorpay_item_id
      ]
    );
  }
  console.log('✅ Seeded 10 realistic Indian grocery/retail SKUs');
};

/**
 * Resets all demo data: clears audit events and upi consents, reseeds catalog products & default merchant
 */
export const resetDemoData = async () => {
  await dbRun(`DELETE FROM audit_events`);
  await dbRun(`DELETE FROM upi_consents`);
  await dbRun(`DELETE FROM products`);
  await dbRun(`DELETE FROM merchants`);

  await dbRun(
    `INSERT OR REPLACE INTO merchants (merchant_id, merchant_name, auto_approve_ceiling_inr, human_approval_ceiling_inr, velocity_limit, blocked_skus, allowed_buyer_agent_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'merchant_001',
      'Demo Kirana Store',
      3000,
      5000,
      5,
      JSON.stringify([]),
      JSON.stringify(['*'])
    ]
  );

  await seedProductsList();
  console.log('🧹 Demo Data Reset: Audit events & consents cleared, merchant catalog re-seeded.');
  return { status: 'success', message: 'Demo data reset successfully' };
};

export default db;
