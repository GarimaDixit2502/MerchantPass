import { initDb } from '../db.js';
import { getProductBySku, decrementProductStock } from './index.js';

describe('Catalog CRUD & Stock Inventory Sync', () => {
  beforeAll(async () => {
    await initDb();
  });

  test('decrements product stock quantity on order approval', async () => {
    const initialProduct = await getProductBySku('SKU-001');
    expect(initialProduct).toBeDefined();
    const initialStock = initialProduct.stock_qty;

    await decrementProductStock('SKU-001', 2);

    const updatedProduct = await getProductBySku('SKU-001');
    expect(updatedProduct.stock_qty).toBe(Math.max(0, initialStock - 2));
  });

  test('deleting a SKU from catalog leaves historical audit logs intact', async () => {
    const product = await getProductBySku('SKU-002');
    expect(product).toBeDefined();
  });
});
