import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { dbGet, dbQuery, dbRun } from '../db.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /catalog/sample-csv -> Downloadable sample catalog CSV template
router.get('/sample-csv', (req, res) => {
  const sampleCsv = `sku,title,description,price_inr,stock_qty,category,gtin
SKU-101,Organic Basmati Rice 5kg,Premium long-grain aged basmati rice,899,25,grocery,8901234567890
SKU-102,Fortune Sunflower Oil 5L,Refined sunflower cooking oil,750,30,grocery,8901234567891
SKU-103,Aashirvaad Atta 10kg,Shudh chakki fresh wheat flour,445,40,staples,8901234567892
SKU-104,Tata Salt 1kg,Vacuum evaporated iodized salt,28,100,staples,8901234567893
SKU-105,Amul Butter 500g,Pasteurized salted butter,275,50,dairy,8901234567894`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="agent_passport_catalog_template.csv"');
  res.send(sampleCsv);
});
export const getMerchantPolicy = async (merchantId = 'merchant_001') => {
  const merchant = await dbGet(`SELECT * FROM merchants WHERE merchant_id = ?`, [merchantId]);
  if (!merchant) return null;

  const blocked_skus = JSON.parse(merchant.blocked_skus || '[]');
  const allowed_buyer_agent_ids = JSON.parse(merchant.allowed_buyer_agent_ids || '["*"]');

  return {
    merchant_id: merchant.merchant_id,
    merchant_name: merchant.merchant_name,
    auto_approve_ceiling_inr: merchant.auto_approve_ceiling_inr,
    human_approval_ceiling_inr: merchant.human_approval_ceiling_inr,
    velocity_limit: merchant.velocity_limit || 5,
    blocked_skus,
    allowed_buyer_agent_ids,
    policy_defaults: {
      auto_approve_ceiling_inr: merchant.auto_approve_ceiling_inr,
      human_approval_ceiling_inr: merchant.human_approval_ceiling_inr,
      velocity_limit: merchant.velocity_limit || 5,
      blocked_skus,
      allowed_buyer_agent_ids
    }
  };
};

/**
 * Fetch all products for a merchant
 */
export const getProducts = async (merchantId = 'merchant_001') => {
  const rows = await dbQuery(`SELECT * FROM products WHERE merchant_id = ?`, [merchantId]);
  return rows.map((p) => ({
    sku: p.sku,
    title: p.title,
    description: p.description,
    price_inr: p.price_inr,
    currency: p.currency,
    stock_qty: p.stock_qty,
    category: p.category,
    image_url: p.image_url,
    gtin: p.gtin,
    razorpay_item_id: p.razorpay_item_id
  }));
};

/**
 * Fetch single product by SKU
 */
export const getProductBySku = async (sku, merchantId = 'merchant_001') => {
  const p = await dbGet(`SELECT * FROM products WHERE sku = ? AND merchant_id = ?`, [sku, merchantId]);
  if (!p) return null;

  return {
    sku: p.sku,
    title: p.title,
    description: p.description,
    price_inr: p.price_inr,
    currency: p.currency,
    stock_qty: p.stock_qty,
    category: p.category,
    image_url: p.image_url,
    gtin: p.gtin,
    razorpay_item_id: p.razorpay_item_id
  };
};

/**
 * Decrement stock quantity for a SKU after an approved purchase
 */
export const decrementProductStock = async (sku, qty, merchantId = 'merchant_001') => {
  await dbRun(
    `UPDATE products 
     SET stock_qty = MAX(0, stock_qty - ?) 
     WHERE sku = ? AND merchant_id = ?`,
    [Number(qty), sku, merchantId]
  );
};

// GET /catalog -> Canonical catalog JSON response
router.get('/', async (req, res) => {
  try {
    const merchantId = req.query.merchant_id || 'merchant_001';
    const merchantPolicy = await getMerchantPolicy(merchantId);

    if (!merchantPolicy) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const products = await getProducts(merchantId);

    res.json({
      merchant_id: merchantPolicy.merchant_id,
      merchant_name: merchantPolicy.merchant_name,
      policy_defaults: merchantPolicy.policy_defaults,
      products
    });
  } catch (err) {
    console.error('Error fetching catalog:', err);
    res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

// POST /catalog -> Add new SKU to catalog
router.post('/', async (req, res) => {
  try {
    const {
      sku,
      title,
      description = '',
      price_inr,
      stock_qty = 10,
      category = 'general',
      image_url = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500',
      gtin = '8900000000000',
      merchant_id = 'merchant_001'
    } = req.body;

    if (!sku || !title || price_inr === undefined) {
      return res.status(400).json({ error: 'sku, title, and price_inr are required' });
    }

    const existing = await getProductBySku(sku, merchant_id);
    if (existing) {
      return res.status(409).json({ error: `Product with SKU '${sku}' already exists` });
    }

    await dbRun(
      `INSERT INTO products (sku, merchant_id, title, description, price_inr, currency, stock_qty, category, image_url, gtin, razorpay_item_id)
       VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, NULL)`,
      [sku, merchant_id, title, description, Number(price_inr), Number(stock_qty), category, image_url, gtin]
    );

    const created = await getProductBySku(sku, merchant_id);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating product SKU:', err);
    res.status(500).json({ error: 'Failed to create product SKU' });
  }
});

// GET /catalog/:sku -> Single product item by SKU
router.get('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const merchantId = req.query.merchant_id || 'merchant_001';
    const product = await getProductBySku(sku, merchantId);

    if (!product) {
      return res.status(404).json({ error: `Product with SKU '${sku}' not found` });
    }

    res.json(product);
  } catch (err) {
    console.error('Error fetching product SKU:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// PUT /catalog/:sku -> Update SKU details, price, stock, or blocked status
router.put('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const merchant_id = req.query.merchant_id || 'merchant_001';
    const { title, description, price_inr, stock_qty, category, image_url, gtin, is_blocked } = req.body;

    const existing = await getProductBySku(sku, merchant_id);
    if (!existing) {
      return res.status(404).json({ error: `Product with SKU '${sku}' not found` });
    }

    const updatedTitle = title !== undefined ? title : existing.title;
    const updatedDesc = description !== undefined ? description : existing.description;
    const updatedPrice = price_inr !== undefined ? Number(price_inr) : existing.price_inr;
    const updatedStock = stock_qty !== undefined ? Number(stock_qty) : existing.stock_qty;
    const updatedCategory = category !== undefined ? category : existing.category;
    const updatedImageUrl = image_url !== undefined ? image_url : existing.image_url;
    const updatedGtin = gtin !== undefined ? gtin : existing.gtin;

    await dbRun(
      `UPDATE products 
       SET title = ?, description = ?, price_inr = ?, stock_qty = ?, category = ?, image_url = ?, gtin = ?
       WHERE sku = ? AND merchant_id = ?`,
      [updatedTitle, updatedDesc, updatedPrice, updatedStock, updatedCategory, updatedImageUrl, updatedGtin, sku, merchant_id]
    );

    // Update merchant blocked_skus list if is_blocked is passed
    if (is_blocked !== undefined) {
      const merchant = await dbGet(`SELECT blocked_skus FROM merchants WHERE merchant_id = ?`, [merchant_id]);
      let blockedList = JSON.parse(merchant?.blocked_skus || '[]');
      if (is_blocked && !blockedList.includes(sku)) {
        blockedList.push(sku);
      } else if (!is_blocked && blockedList.includes(sku)) {
        blockedList = blockedList.filter((s) => s !== sku);
      }
      await dbRun(`UPDATE merchants SET blocked_skus = ? WHERE merchant_id = ?`, [JSON.stringify(blockedList), merchant_id]);
    }

    const updatedProduct = await getProductBySku(sku, merchant_id);
    res.json(updatedProduct);
  } catch (err) {
    console.error('Error updating product SKU:', err);
    res.status(500).json({ error: 'Failed to update product SKU' });
  }
});

// Helper: Clean currency symbols (₹, $, Rs, commas) to extract numeric price
function parseNumericPrice(val) {
  if (val === undefined || val === null || val === '') return NaN;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return cleaned !== '' ? parseFloat(cleaned) : NaN;
}

// Helper: Clean text suffixes (e.g. "28 units" -> 28, "100 pcs" -> 100) to extract numeric stock integer
function parseNumericStock(val) {
  if (val === undefined || val === null || val === '') return NaN;
  if (typeof val === 'number') return Math.floor(val);
  const cleaned = String(val).replace(/[^0-9]/g, '');
  return cleaned !== '' ? parseInt(cleaned, 10) : NaN;
}

// Helper: Case-insensitive dictionary key lookup
function getRowVal(row, possibleKeys) {
  const rowKeys = Object.keys(row);
  for (const pKey of possibleKeys) {
    const matchedKey = rowKeys.find((rk) => rk.trim().toLowerCase() === pKey.toLowerCase());
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
      return row[matchedKey];
    }
  }
  return undefined;
}

// POST /catalog/import-preview -> Parse uploaded Excel/CSV file & validate rows before confirmation
router.post('/import-preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please upload a .csv or .xlsx file.' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'Uploaded spreadsheet is empty.' });
    }

    const merchantId = req.query.merchant_id || 'merchant_001';
    const existingProducts = await getProducts(merchantId);
    const existingSkuSet = new Set(existingProducts.map((p) => p.sku));
    const seenSheetSkus = new Set();

    const parsedRows = [];
    let validCount = 0;
    let errorCount = 0;

    rawRows.forEach((row, idx) => {
      const rawSku = getRowVal(row, ['sku', 'sku id', 'item code', 'code']) || '';
      const rawTitle = getRowVal(row, ['product name', 'title', 'name', 'item name']) || '';
      const rawDesc = getRowVal(row, ['description', 'desc']) || '';
      const rawPrice = getRowVal(row, ['price (₹)', 'price_inr', 'price (inr)', 'price', 'rate', 'mrp']);
      const rawStock = getRowVal(row, ['live stock qty', 'stock_qty', 'stock', 'quantity', 'qty', 'available stock']);
      const rawCat = getRowVal(row, ['category', 'group']) || 'grocery';
      const rawGtin = getRowVal(row, ['gtin', 'barcode', 'ean', 'upc']) || '8900000000000';

      const sku = String(rawSku).trim();
      const title = String(rawTitle).trim();
      const description = String(rawDesc).trim();
      const category = String(rawCat).trim().toLowerCase();
      const gtin = String(rawGtin).trim();

      const price = parseNumericPrice(rawPrice);
      const stock = parseNumericStock(rawStock);

      const errors = [];

      if (!sku) {
        errors.push('Missing SKU');
      } else if (seenSheetSkus.has(sku)) {
        errors.push(`Duplicate SKU '${sku}' in spreadsheet`);
      } else {
        seenSheetSkus.add(sku);
      }

      if (!title) {
        errors.push('Missing Product Title');
      }

      if (isNaN(price) || price < 0) {
        errors.push('Invalid or non-numeric price_inr');
      }

      if (isNaN(stock) || stock < 0) {
        errors.push('Invalid or non-numeric stock_qty');
      }

      const isValid = errors.length === 0;
      if (isValid) validCount++;
      else errorCount++;

      parsedRows.push({
        row_num: idx + 1,
        sku,
        title,
        description,
        price_inr: isNaN(price) ? 0 : price,
        stock_qty: isNaN(stock) ? 0 : stock,
        category,
        gtin,
        is_update: existingSkuSet.has(sku),
        valid: isValid,
        errors
      });
    });

    res.json({
      total_rows: parsedRows.length,
      valid_rows_count: validCount,
      error_rows_count: errorCount,
      rows: parsedRows
    });
  } catch (err) {
    console.error('Error parsing catalog spreadsheet:', err);
    res.status(500).json({ error: `Failed to parse file: ${err.message}` });
  }
});

// POST /catalog/import-confirm -> Confirm & upsert validated spreadsheet SKUs into products table
router.post('/import-confirm', async (req, res) => {
  try {
    const { items = [], merchant_id = 'merchant_001' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for import confirmation' });
    }

    let insertedCount = 0;
    let updatedCount = 0;

    for (const p of items) {
      if (!p.sku || !p.title || p.price_inr === undefined) continue;

      const existing = await getProductBySku(p.sku, merchant_id);
      if (existing) {
        await dbRun(
          `UPDATE products 
           SET title = ?, description = ?, price_inr = ?, stock_qty = ?, category = ?, gtin = ?
           WHERE sku = ? AND merchant_id = ?`,
          [p.title, p.description || '', Number(p.price_inr), Number(p.stock_qty), p.category || 'grocery', p.gtin || '8900000000000', p.sku, merchant_id]
        );
        updatedCount++;
      } else {
        await dbRun(
          `INSERT INTO products (sku, merchant_id, title, description, price_inr, currency, stock_qty, category, image_url, gtin, razorpay_item_id)
           VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, NULL)`,
          [
            p.sku,
            merchant_id,
            p.title,
            p.description || '',
            Number(p.price_inr),
            Number(p.stock_qty),
            p.category || 'grocery',
            p.image_url || 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500',
            p.gtin || '8900000000000'
          ]
        );
        insertedCount++;
      }
    }

    const updatedCatalog = await getProducts(merchant_id);

    res.json({
      status: 'success',
      message: `Catalog import complete! ${insertedCount} SKUs added, ${updatedCount} SKUs updated.`,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      products_count: updatedCatalog.length
    });
  } catch (err) {
    console.error('Error confirming catalog import:', err);
    res.status(500).json({ error: 'Failed to complete catalog import' });
  }
});

// DELETE /catalog/:sku -> Delete SKU from catalog (past audit events remain completely intact)
router.delete('/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const merchant_id = req.query.merchant_id || 'merchant_001';

    const existing = await getProductBySku(sku, merchant_id);
    if (!existing) {
      return res.status(404).json({ error: `Product with SKU '${sku}' not found` });
    }

    await dbRun(`DELETE FROM products WHERE sku = ? AND merchant_id = ?`, [sku, merchant_id]);

    res.json({ status: 'success', message: `Product SKU '${sku}' deleted from catalog. Historical audit logs preserved.` });
  } catch (err) {
    console.error('Error deleting product SKU:', err);
    res.status(500).json({ error: 'Failed to delete product SKU' });
  }
});

export default router;
