const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize, enforceTenant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/shops
 * @desc    Fetch all shops globally (Super Admin only)
 * @access  Private (Super Admin)
 */
router.get('/', authorize(['super_admin']), async (req, res) => {
  try {
    const [shops] = await db.query(
      'SELECT s.*, (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count FROM shops s ORDER BY s.created_at DESC'
    );
    res.json(shops);
  } catch (error) {
    console.error('Fetch global shops error:', error);
    res.status(500).json({ error: 'Server error retrieving shop directory.' });
  }
});

/**
 * @route   GET /api/shops/my-shop
 * @desc    Fetch active tenant shop details
 */
router.get('/my-shop', enforceTenant, authorize(['shop_admin', 'shop_staff']), async (req, res) => {
  const shopId = req.shopId;
  try {
    const [shops] = await db.query(
      'SELECT id, name, email, phone, address, tax_rate, logo, status, loyalty_enabled, loyalty_point_earn_rate, loyalty_point_value, created_at FROM shops WHERE id = ?',
      [shopId]
    );

    if (shops.length === 0) {
      return res.status(404).json({ error: 'Shop profile not found.' });
    }

    const shop = shops[0];

    // If the shop is suspended, deny access
    if (shop.status !== 'active') {
      return res.status(403).json({ error: 'This shop has been suspended. Please contact the system administrator.' });
    }

    res.json(shop);
  } catch (error) {
    console.error('Fetch shop error:', error);
    res.status(500).json({ error: 'Server error retrieving shop profile.' });
  }
});

/**
 * @route   PUT /api/shops/my-shop
 * @desc    Update active tenant shop details
 */
router.put('/my-shop', enforceTenant, authorize(['shop_admin']), async (req, res) => {
  const shopId = req.shopId;
  const { name, email, phone, address, tax_rate, logo, loyalty_enabled, loyalty_point_earn_rate, loyalty_point_value } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Shop name and email are required.' });
  }

  const taxRateVal = tax_rate !== undefined ? parseFloat(tax_rate) : 10.00;
  if (isNaN(taxRateVal) || taxRateVal < 0 || taxRateVal > 100) {
    return res.status(400).json({ error: 'Tax rate must be a valid number between 0 and 100.' });
  }

  // Validate loyalty parameters if enabled
  const isLoyaltyEnabled = loyalty_enabled ? 1 : 0;
  const earnRateVal = loyalty_point_earn_rate !== undefined ? parseFloat(loyalty_point_earn_rate) : 100.00;
  const pointValueVal = loyalty_point_value !== undefined ? parseFloat(loyalty_point_value) : 1.00;

  if (isLoyaltyEnabled) {
    if (isNaN(earnRateVal) || earnRateVal <= 0) {
      return res.status(400).json({ error: 'Loyalty earn rate must be a valid number greater than 0.' });
    }
    if (isNaN(pointValueVal) || pointValueVal <= 0) {
      return res.status(400).json({ error: 'Loyalty point redemption value must be a valid number greater than 0.' });
    }
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM shops WHERE email = ? AND id != ?',
      [email, shopId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Another shop is already registered with this email.' });
    }

    const updateFields = [
      'name = ?', 
      'email = ?', 
      'phone = ?', 
      'address = ?', 
      'tax_rate = ?',
      'loyalty_enabled = ?',
      'loyalty_point_earn_rate = ?',
      'loyalty_point_value = ?'
    ];
    const queryParams = [
      name, 
      email, 
      phone || null, 
      address || null, 
      taxRateVal,
      isLoyaltyEnabled,
      earnRateVal,
      pointValueVal
    ];

    if (logo !== undefined) {
      updateFields.push('logo = ?');
      queryParams.push(logo === '' ? null : logo);
    }

    queryParams.push(shopId);

    await db.query(
      `UPDATE shops SET ${updateFields.join(', ')} WHERE id = ?`,
      queryParams
    );

    res.json({ message: 'Shop details updated successfully.' });
  } catch (error) {
    console.error('Update shop error:', error);
    res.status(500).json({ error: 'Server error updating shop details.' });
  }
});

/**
 * @route   PUT /api/shops/:id/status
 * @desc    Toggle active status of a shop (Super Admin only)
 * @access  Private (Super Admin)
 */
router.put('/:id/status', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;
  const { status } = req.body;

  if (!status || !['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Please specify status as active or inactive.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM shops WHERE id = ?', [shopId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    await db.query('UPDATE shops SET status = ? WHERE id = ?', [status, shopId]);
    res.json({ message: `Shop status updated to ${status} successfully.` });
  } catch (error) {
    console.error('Update shop status error:', error);
    res.status(500).json({ error: 'Server error updating shop status.' });
  }
});

/**
 * @route   PUT /api/shops/:id
 * @desc    Update shop profile details (Super Admin only)
 * @access  Private (Super Admin)
 */
router.put('/:id', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;
  const { name, email, phone, address, tax_rate } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Shop name and email are required.' });
  }

  const taxRateVal = tax_rate !== undefined ? parseFloat(tax_rate) : 10.00;
  if (isNaN(taxRateVal) || taxRateVal < 0 || taxRateVal > 100) {
    return res.status(400).json({ error: 'Tax rate must be a valid number between 0 and 100.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM shops WHERE id = ?', [shopId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    // Check email uniqueness (excluding the current shop)
    const [emailConflict] = await db.query(
      'SELECT id FROM shops WHERE email = ? AND id != ?',
      [email, shopId]
    );
    if (emailConflict.length > 0) {
      return res.status(400).json({ error: 'Another shop is already registered with this email.' });
    }

    await db.query(
      'UPDATE shops SET name = ?, email = ?, phone = ?, address = ?, tax_rate = ? WHERE id = ?',
      [name, email, phone || null, address || null, taxRateVal, shopId]
    );

    res.json({ message: 'Shop details updated successfully.' });
  } catch (error) {
    console.error('Update shop error:', error);
    res.status(500).json({ error: 'Server error updating shop details.' });
  }
});

/**
 * @route   DELETE /api/shops/:id
 * @desc    Permanently delete a shop and all associated data (Super Admin only)
 * @access  Private (Super Admin)
 */
router.delete('/:id', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;

  const connection = await db.getConnection();
  try {
    const [existing] = await connection.query(
      'SELECT id, name FROM shops WHERE id = ?',
      [shopId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    await connection.beginTransaction();

    // 1. Delete sale items belonging to the shop
    await connection.query('DELETE FROM sale_items WHERE shop_id = ?', [shopId]);

    // 2. Delete sales belonging to the shop
    await connection.query('DELETE FROM sales WHERE shop_id = ?', [shopId]);

    // 3. Delete products belonging to the shop
    await connection.query('DELETE FROM products WHERE shop_id = ?', [shopId]);

    // 4. Delete customers belonging to the shop
    await connection.query('DELETE FROM customers WHERE shop_id = ?', [shopId]);

    // 5. Delete users belonging to the shop
    await connection.query('DELETE FROM users WHERE shop_id = ?', [shopId]);

    // 6. Delete suppliers belonging to the shop
    await connection.query('DELETE FROM suppliers WHERE shop_id = ?', [shopId]);

    // 7. Delete the shop itself
    await connection.query('DELETE FROM shops WHERE id = ?', [shopId]);

    await connection.commit();

    res.json({ message: `Shop "${existing[0].name}" and all associated users/data have been permanently deleted.` });
  } catch (error) {
    await connection.rollback();
    console.error('Delete shop transaction error:', error);
    res.status(500).json({ error: 'Failed to delete shop and its associated data.' });
  } finally {
    connection.release();
  }
});

/**
 * @route   GET /api/shops/:id/users
 * @desc    List all users (admins + staff) belonging to a shop (Super Admin only)
 * @access  Private (Super Admin)
 */
router.get('/:id/users', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;
  try {
    const [existing] = await db.query('SELECT id FROM shops WHERE id = ?', [shopId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    const [users] = await db.query(
      `SELECT id, name, email, role, status, created_at
       FROM users
       WHERE shop_id = ?
       ORDER BY FIELD(role, 'shop_admin', 'shop_staff'), name ASC`,
      [shopId]
    );
    res.json(users);
  } catch (error) {
    console.error('Fetch shop users error:', error);
    res.status(500).json({ error: 'Server error retrieving shop users.' });
  }
});

/**
 * @route   PUT /api/shops/:id/users/:userId/reset-password
 * @desc    Super Admin force-resets a user's password in any tenant shop
 * @access  Private (Super Admin)
 */
router.put('/:id/users/:userId/reset-password', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;
  const userId = req.params.userId;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  try {
    // Verify user belongs to this shop and is not a super_admin
    const [users] = await db.query(
      'SELECT id, name, role FROM users WHERE id = ? AND shop_id = ?',
      [userId, shopId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found in this shop.' });
    }

    if (users[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot reset a Super Admin password via this route.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(new_password, salt);

    await db.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );

    res.json({ message: `Password for "${users[0].name}" has been reset successfully.` });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error resetting password.' });
  }
});

/**
 * @route   PUT /api/shops/:id/users/:userId/status
 * @desc    Super Admin toggle a tenant user's active/inactive status
 * @access  Private (Super Admin)
 */
router.put('/:id/users/:userId/status', authorize(['super_admin']), async (req, res) => {
  const shopId = req.params.id;
  const userId = req.params.userId;
  const { status } = req.body;

  if (!status || !['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }

  try {
    const [users] = await db.query(
      'SELECT id, name, role FROM users WHERE id = ? AND shop_id = ?',
      [userId, shopId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found in this shop.' });
    }

    if (users[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify a Super Admin status via this route.' });
    }

    await db.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    res.json({ message: `User "${users[0].name}" status set to ${status}.` });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Server error updating user status.' });
  }
});

module.exports = router;
