const express = require('express');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(enforceTenant);

/**
 * @route   POST /api/sales
 * @desc    Process a POS checkout transaction
 * @access  Private (shop_admin, shop_staff)
 */
router.post('/', authorize(['shop_admin', 'shop_staff']), async (req, res) => {
  const shopId = req.shopId;
  const userId = req.user.id;
  const { customer_id, items = [], discount = 0, tax = 0, payment_method, reduce_due_amount = 0 } = req.body;
  const parsedReduceDue = parseFloat(reduce_due_amount || 0);

  if ((!items || !Array.isArray(items) || items.length === 0) && parsedReduceDue <= 0) {
    return res.status(400).json({ error: 'Checkout cart is empty.' });
  }

  if (!payment_method) {
    return res.status(400).json({ error: 'Please specify payment method.' });
  }

  const connection = await db.getConnection();

  try {
    // 1. Begin Database Transaction
    await connection.beginTransaction();

    let calculatedTotal = 0;
    const validatedItems = [];
    const stockAlerts = [];

    // 2. Validate products, prices, and stock levels
    for (const item of items) {
      const { product_id, quantity } = item;

      if (!product_id || !quantity || quantity <= 0) {
        throw new Error(`Invalid item details for product ID ${product_id}.`);
      }

      // SELECT FOR UPDATE to lock the product row and prevent race conditions on stock quantity
      const [productRows] = await connection.query(
        'SELECT id, name, price, stock_quantity, low_stock_threshold FROM products WHERE id = ? AND shop_id = ? FOR UPDATE',
        [product_id, shopId]
      );

      if (productRows.length === 0) {
        throw new Error(`Product with ID ${product_id} not found in this shop.`);
      }

      const product = productRows[0];

      // Check stock availability
      if (product.stock_quantity < quantity) {
        throw new Error(`Insufficient stock for product "${product.name}". Available: ${product.stock_quantity}, requested: ${quantity}.`);
      }

      const unitPrice = parseFloat(product.price);
      const subtotal = unitPrice * quantity;
      calculatedTotal += subtotal;

      // Track items to insert later
      validatedItems.push({
        product_id,
        quantity,
        unit_price: unitPrice,
        subtotal
      });

      // Deduct stock quantity
      const newStock = product.stock_quantity - quantity;
      await connection.query(
        'UPDATE products SET stock_quantity = ? WHERE id = ? AND shop_id = ?',
        [newStock, product_id, shopId]
      );

      // Check if stock dropped below threshold
      if (newStock <= product.low_stock_threshold) {
        stockAlerts.push({
          product_id,
          name: product.name,
          remaining_stock: newStock,
          threshold: product.low_stock_threshold
        });
      }
    }

    // 3. Compute financial amounts
    // Retrieve shop settings for loyalty program
    const [shopRows] = await connection.query(
      'SELECT loyalty_enabled, loyalty_point_earn_rate, loyalty_point_value FROM shops WHERE id = ?',
      [shopId]
    );
    const shopSettings = shopRows[0] || { loyalty_enabled: 0, loyalty_point_earn_rate: 100.00, loyalty_point_value: 1.00 };
    const isLoyaltyEnabled = shopSettings.loyalty_enabled === 1 || shopSettings.loyalty_enabled === true;

    // Check if points are redeemed
    const { redeem_points = 0 } = req.body;
    const parsedRedeemPoints = parseInt(redeem_points || 0, 10);
    let pointsRedeemedValue = 0.00;

    if (isLoyaltyEnabled && customer_id && parsedRedeemPoints > 0) {
      // Validate customer has enough points
      const [customerRows] = await connection.query(
        'SELECT loyalty_points FROM customers WHERE id = ? AND shop_id = ? FOR UPDATE',
        [customer_id, shopId]
      );
      if (customerRows.length === 0) {
        throw new Error('Customer not found for loyalty points redemption.');
      }
      const currentPoints = customerRows[0].loyalty_points || 0;
      if (currentPoints < parsedRedeemPoints) {
        throw new Error(`Insufficient loyalty points. Customer has ${currentPoints}, requested redemption of ${parsedRedeemPoints}.`);
      }
      pointsRedeemedValue = parsedRedeemPoints * parseFloat(shopSettings.loyalty_point_value);
      
      // Deduct points
      await connection.query(
        'UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ? AND shop_id = ?',
        [parsedRedeemPoints, customer_id, shopId]
      );
    }

    const netAmount = calculatedTotal - parseFloat(discount) - pointsRedeemedValue;
    const finalAmount = Math.max(0, netAmount) + parseFloat(tax) + parsedReduceDue;

    // Parse paid amount and compute due amount
    const paidAmount = req.body.paid_amount !== undefined ? parseFloat(req.body.paid_amount) : finalAmount;
    const dueAmount = finalAmount - paidAmount;

    if (dueAmount > 0 && !customer_id) {
      throw new Error('Customer profile selection is required to record outstanding due balance.');
    }

    // Award loyalty points on net items spending
    let pointsEarned = 0;
    if (isLoyaltyEnabled && customer_id) {
      const earnRate = parseFloat(shopSettings.loyalty_point_earn_rate) || 100.00;
      const pointsEarningBasis = calculatedTotal - parseFloat(discount) - pointsRedeemedValue;
      if (pointsEarningBasis > 0) {
        pointsEarned = Math.floor(pointsEarningBasis / earnRate);
      }
      if (pointsEarned > 0) {
        await connection.query(
          'UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ? AND shop_id = ?',
          [pointsEarned, customer_id, shopId]
        );
      }
    }

    // 4. Save transaction metadata in sales table (with paid and due amounts and loyalty points)
    const [salesResult] = await connection.query(
      `INSERT INTO sales (shop_id, customer_id, user_id, total_amount, discount, tax, final_amount, paid_amount, due_amount, payment_method, points_earned, points_redeemed, points_redeemed_value) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [shopId, customer_id || null, userId, calculatedTotal, discount, tax, finalAmount, paidAmount, dueAmount, payment_method, pointsEarned, parsedRedeemPoints, pointsRedeemedValue]
    );

    const saleId = salesResult.insertId;

    // If a due payment is collected, decrement customer due_balance
    if (parsedReduceDue > 0 && customer_id) {
      await connection.query(
        'UPDATE customers SET due_balance = due_balance - ? WHERE id = ? AND shop_id = ?',
        [parsedReduceDue, customer_id, shopId]
      );
    }

    // If there is a due balance, update customer record and add an automated HeldBills entry
    if (dueAmount > 0) {
      // Increment customer due_balance
      await connection.query(
        'UPDATE customers SET due_balance = due_balance + ? WHERE id = ? AND shop_id = ?',
        [dueAmount, customer_id, shopId]
      );

      // Fetch customer details to copy to held bills
      const [customerRows] = await connection.query(
        'SELECT name, phone, address FROM customers WHERE id = ? AND shop_id = ?',
        [customer_id, shopId]
      );
      
      if (customerRows.length > 0) {
        const cust = customerRows[0];
        const note = `Due from Sale #${saleId}`;
        await connection.query(
          `INSERT INTO held_bills (shop_id, user_id, customer_id, customer_name, customer_phone, customer_address, discount_percent, notes, items, due_amount, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'held')`,
          [
            shopId,
            userId,
            customer_id,
            cust.name,
            cust.phone || null,
            cust.address || null,
            (discount / calculatedTotal) * 100, // Store discount as a percentage for context
            note, 
            JSON.stringify(validatedItems), // Automatically add the sale items to the held bill
            dueAmount
          ]
        );
      }
    }

    // 5. Save line items in sale_items table
    const saleItemInsertQueries = validatedItems.map(item => {
      return connection.query(
        `INSERT INTO sale_items (shop_id, sale_id, product_id, quantity, unit_price, subtotal) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shopId, saleId, item.product_id, item.quantity, item.unit_price, item.subtotal]
      );
    });

    await Promise.all(saleItemInsertQueries);

    // 6. Commit Database Transaction
    await connection.commit();

    res.status(201).json({
      message: 'Transaction completed successfully.',
      sale_id: saleId,
      final_amount: finalAmount,
      points_earned: pointsEarned,
      stock_alerts: stockAlerts // Returns products that hit low stock warnings
    });

  } catch (error) {
    // Rollback changes on error
    await connection.rollback();
    console.error('POS Checkout Transaction failed:', error.message);
    res.status(400).json({ error: error.message || 'Transaction failed.' });
  } finally {
    connection.release();
  }
});

/**
 * @route   GET /api/sales
 * @desc    Retrieve all sale transactions for the shop (tenant isolated)
 */
router.get('/', async (req, res) => {
  const shopId = req.shopId;
  const { start_date, end_date, product_name } = req.query;

  try {
    let sql = `
      SELECT 
        s.*, 
        u.name as staff_name, 
        c.name as customer_name,
        (SELECT GROUP_CONCAT(p.name SEPARATOR ', ') FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as product_names
      FROM sales s 
      LEFT JOIN users u ON s.user_id = u.id 
      LEFT JOIN customers c ON s.customer_id = c.id 
      WHERE s.shop_id = ?
    `;
    const params = [shopId];

    if (start_date && end_date) {
      sql += ' AND DATE(s.created_at) BETWEEN ? AND ?';
      params.push(`${start_date} 00:00:00`, `${end_date} 23:59:59`);
    }

    if (product_name) {
      sql += ' AND EXISTS (SELECT 1 FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id AND p.name LIKE ?)';
      params.push(`%${product_name}%`);
    }

    sql += ' ORDER BY s.created_at DESC';

    const [sales] = await db.query(sql, params);

    // In order to support detailed CSV exports, we will now fetch and embed the sale_items for each sale.
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
      const [items] = await db.query(
        `SELECT si.sale_id, si.quantity, p.name as product_name, p.unit 
         FROM sale_items si 
         JOIN products p ON si.product_id = p.id 
         WHERE si.sale_id IN (?) AND si.shop_id = ?`,
        [saleIds, shopId]
      );

      sales.forEach(sale => {
        sale.items = items.filter(item => item.sale_id === sale.id);
      });
    }

    res.json(sales);
  } catch (error) {
    console.error('Fetch sales error:', error);
    res.status(500).json({ error: 'Server error retrieving sales data.' });
  }
});

/**
 * @route   GET /api/sales/:id
 * @desc    Retrieve details for a specific sale transaction (tenant isolated)
 */
router.get('/:id', async (req, res) => {
  const saleId = req.params.id;
  const shopId = req.shopId;

  try {
    // Retrieve sale header
    const [sales] = await db.query(
      `SELECT s.*, u.name as staff_name, 
              c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              sh.name as shop_name, sh.phone as shop_phone, sh.address as shop_address, sh.email as shop_email
       FROM sales s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN shops sh ON s.shop_id = sh.id
       WHERE s.id = ? AND s.shop_id = ?`,
      [saleId, shopId]
    );

    if (sales.length === 0) {
      return res.status(404).json({ error: 'Sale record not found or access denied.' });
    }

    // Retrieve sale items (includes cost_price for profit calculation)
    const [items] = await db.query(
      `SELECT si.*, p.name as product_name, p.sku as product_sku, p.cost_price 
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ? AND si.shop_id = ?`,
      [saleId, shopId]
    );

    res.json({
      ...sales[0],
      items
    });
  } catch (error) {
    console.error('Fetch sale details error:', error);
    res.status(500).json({ error: 'Server error retrieving sale details.' });
  }
});

/**
 * @route   DELETE /api/sales/:id
 * @desc    Delete/void a sale transaction (admin only). Restores stock and adjusts customer due balance.
 * @access  Private (shop_admin)
 */
router.delete('/:id', authorize(['shop_admin']), async (req, res) => {
  const saleId = req.params.id;
  const shopId = req.shopId;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Fetch and lock the sale record
    const [sales] = await connection.query(
      'SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE',
      [saleId, shopId]
    );

    if (sales.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sale record not found or access denied.' });
    }

    const sale = sales[0];

    // 2. Fetch all sale_items for stock restoration
    const [saleItems] = await connection.query(
      'SELECT * FROM sale_items WHERE sale_id = ? AND shop_id = ?',
      [saleId, shopId]
    );

    // 3. Restore stock for each sold item
    for (const item of saleItems) {
      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
        [item.quantity, item.product_id, shopId]
      );
    }

    // 4. Reverse customer due_balance if there was a due amount on this sale
    const dueAmount = parseFloat(sale.due_amount || 0);
    if (dueAmount > 0 && sale.customer_id) {
      await connection.query(
        'UPDATE customers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
        [dueAmount, sale.customer_id, shopId]
      );
    }

    // 5. Delete sale_items first (foreign key child)
    await connection.query(
      'DELETE FROM sale_items WHERE sale_id = ? AND shop_id = ?',
      [saleId, shopId]
    );

    // 6. Delete the sale record
    await connection.query(
      'DELETE FROM sales WHERE id = ? AND shop_id = ?',
      [saleId, shopId]
    );

    await connection.commit();

    res.json({
      message: `Sale #${saleId} deleted successfully. Stock restored and totals adjusted.`,
      deleted_sale_id: parseInt(saleId),
      items_restored: saleItems.length,
      due_reversed: dueAmount
    });

  } catch (error) {
    await connection.rollback();
    console.error('Delete sale error:', error);
    res.status(500).json({ error: 'Server error deleting sale transaction.' });
  } finally {
    connection.release();
  }
});

/**
 * @route   POST /api/sales/bulk-delete
 * @desc    Delete/void multiple sale transactions (admin only). Restores stock and adjusts customer due balance for each.
 * @access  Private (shop_admin)
 */
router.post('/bulk-delete', authorize(['shop_admin']), async (req, res) => {
  const { ids } = req.body;
  const shopId = req.shopId;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of sale IDs to delete.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let totalRestoredItems = 0;
    let totalDueReversed = 0;
    const deletedSaleIds = [];

    for (const saleId of ids) {
      // 1. Fetch and lock the sale record
      const [sales] = await connection.query(
        'SELECT * FROM sales WHERE id = ? AND shop_id = ? FOR UPDATE',
        [saleId, shopId]
      );

      if (sales.length === 0) {
        continue;
      }

      const sale = sales[0];

      // 2. Fetch all sale_items for stock restoration
      const [saleItems] = await connection.query(
        'SELECT * FROM sale_items WHERE sale_id = ? AND shop_id = ?',
        [saleId, shopId]
      );

      // 3. Restore stock for each sold item
      for (const item of saleItems) {
        await connection.query(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND shop_id = ?',
          [item.quantity, item.product_id, shopId]
        );
        totalRestoredItems += item.quantity;
      }

      // 4. Reverse customer due_balance if there was a due amount on this sale
      const dueAmount = parseFloat(sale.due_amount || 0);
      if (dueAmount > 0 && sale.customer_id) {
        await connection.query(
          'UPDATE customers SET due_balance = GREATEST(due_balance - ?, 0) WHERE id = ? AND shop_id = ?',
          [dueAmount, sale.customer_id, shopId]
        );
        totalDueReversed += dueAmount;
      }

      // 5. Delete sale_items first (foreign key child)
      await connection.query(
        'DELETE FROM sale_items WHERE sale_id = ? AND shop_id = ?',
        [saleId, shopId]
      );

      // 6. Delete the sale record
      await connection.query(
        'DELETE FROM sales WHERE id = ? AND shop_id = ?',
        [saleId, shopId]
      );

      deletedSaleIds.push(parseInt(saleId));
    }

    await connection.commit();

    res.json({
      message: `${deletedSaleIds.length} sales deleted successfully. Stock restored and customer balances updated.`,
      deleted_sale_ids: deletedSaleIds,
      items_restored: totalRestoredItems,
      due_reversed: totalDueReversed
    });

  } catch (error) {
    await connection.rollback();
    console.error('Bulk delete sales error:', error);
    res.status(500).json({ error: 'Server error deleting sale transactions.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
