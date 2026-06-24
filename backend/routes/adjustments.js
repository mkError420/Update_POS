const express = require('express');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(enforceTenant);

/**
 * @route   GET /api/adjustments
 * @desc    Get all inventory adjustments for the active shop
 */
router.get('/', async (req, res) => {
  const shopId = req.shopId;
  const { product_id, start_date, end_date, adjustment_type } = req.query;
  
  try {
    let sql = `
      SELECT ia.*, p.name AS product_name, p.sku AS product_sku, u.name AS adjusted_by_name
      FROM inventory_adjustments ia
      JOIN products p ON ia.product_id = p.id
      JOIN users u ON ia.adjusted_by = u.id
      WHERE ia.shop_id = ?
    `;
    const params = [shopId];

    if (product_id) {
      sql += ' AND ia.product_id = ?';
      params.push(product_id);
    }
    if (adjustment_type) {
      sql += ' AND ia.adjustment_type = ?';
      params.push(adjustment_type);
    }
    if (start_date) {
      sql += ' AND DATE(ia.created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND DATE(ia.created_at) <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY ia.created_at DESC';

    const [adjustments] = await db.query(sql, params);
    res.json(adjustments);
  } catch (error) {
    console.error('Fetch adjustments error:', error);
    res.status(500).json({ error: 'Server error fetching inventory adjustments.' });
  }
});

/**
 * @route   POST /api/adjustments
 * @desc    Create a new inventory adjustment
 */
router.post('/', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const userId = req.user.id;
  const { product_id, adjusted_quantity, reason, notes } = req.body;

  if (!product_id || adjusted_quantity === undefined || adjusted_quantity === null) {
    return res.status(400).json({ error: 'Product ID and adjusted quantity are required.' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'Reason for adjustment is required.' });
  }

  const newQuantity = parseInt(adjusted_quantity);
  if (newQuantity < 0) {
    return res.status(400).json({ error: 'Adjusted quantity cannot be negative.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get current product stock
    const [products] = await conn.query(
      'SELECT id, stock_quantity, name, sku FROM products WHERE id = ? AND shop_id = ?',
      [product_id, shopId]
    );

    if (products.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Product not found.' });
    }

    const product = products[0];
    const previousQuantity = parseInt(product.stock_quantity);
    const difference = newQuantity - previousQuantity;
    const adjustmentType = difference >= 0 ? 'increase' : 'decrease';

    // Update product stock
    await conn.query(
      'UPDATE products SET stock_quantity = ? WHERE id = ? AND shop_id = ?',
      [newQuantity, product_id, shopId]
    );

    // Log the adjustment
    const [result] = await conn.query(
      `INSERT INTO inventory_adjustments (shop_id, product_id, previous_quantity, adjusted_quantity, difference, adjustment_type, reason, notes, adjusted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, product_id, previousQuantity, newQuantity, difference, adjustmentType, reason, notes || null, userId]
    );

    await conn.commit();
    res.status(201).json({ 
      message: 'Inventory adjustment recorded successfully.',
      id: result.insertId,
      previous_quantity: previousQuantity,
      new_quantity: newQuantity,
      difference: difference
    });
  } catch (error) {
    await conn.rollback();
    console.error('Create adjustment error:', error);
    res.status(500).json({ error: 'Server error creating inventory adjustment.' });
  } finally {
    conn.release();
  }
});

/**
 * @route   GET /api/adjustments/stats
 * @desc    Get adjustment statistics for the shop
 */
router.get('/stats', async (req, res) => {
  const shopId = req.shopId;
  
  try {
    const [totalStats] = await db.query(
      `SELECT 
        COUNT(*) as total_adjustments,
        SUM(CASE WHEN adjustment_type = 'increase' THEN 1 ELSE 0 END) as increases,
        SUM(CASE WHEN adjustment_type = 'decrease' THEN 1 ELSE 0 END) as decreases,
        SUM(difference) as net_change
       FROM inventory_adjustments
       WHERE shop_id = ?`,
      [shopId]
    );

    const [recentAdjustments] = await db.query(
      `SELECT ia.*, p.name AS product_name
       FROM inventory_adjustments ia
       JOIN products p ON ia.product_id = p.id
       WHERE ia.shop_id = ?
       ORDER BY ia.created_at DESC
       LIMIT 10`,
      [shopId]
    );

    res.json({
      stats: totalStats[0],
      recent_adjustments: recentAdjustments
    });
  } catch (error) {
    console.error('Fetch adjustment stats error:', error);
    res.status(500).json({ error: 'Server error fetching adjustment statistics.' });
  }
});

/**
 * @route   DELETE /api/adjustments/:id
 * @desc    Delete an inventory adjustment (and revert stock)
 */
router.delete('/:id', authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const adjustmentId = req.params.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get the adjustment record
    const [adjustments] = await conn.query(
      'SELECT * FROM inventory_adjustments WHERE id = ? AND shop_id = ?',
      [adjustmentId, shopId]
    );

    if (adjustments.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Adjustment not found.' });
    }

    const adjustment = adjustments[0];

    // Revert the stock to previous quantity
    await conn.query(
      'UPDATE products SET stock_quantity = ? WHERE id = ? AND shop_id = ?',
      [adjustment.previous_quantity, adjustment.product_id, shopId]
    );

    // Delete the adjustment record
    await conn.query(
      'DELETE FROM inventory_adjustments WHERE id = ? AND shop_id = ?',
      [adjustmentId, shopId]
    );

    await conn.commit();
    res.json({ message: 'Adjustment deleted and stock reverted successfully.' });
  } catch (error) {
    await conn.rollback();
    console.error('Delete adjustment error:', error);
    res.status(500).json({ error: 'Server error deleting adjustment.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
