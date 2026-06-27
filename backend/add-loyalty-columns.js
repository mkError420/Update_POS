const db = require('./config/db');

async function addColumn(tableName, columnDefinition) {
  try {
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition};`;
    await db.query(sql);
    console.log(`✓ Successfully added column to ${tableName}: ${columnDefinition}`);
  } catch (error) {
    if (error.code === 'ER_DUP_COLUMN_NAME') {
      console.log(`ℹ Column in ${tableName} already exists for: ${columnDefinition.split(' ')[0]}`);
    } else {
      console.error(`✗ Failed to add column to ${tableName} (${columnDefinition}):`, error.message);
    }
  }
}

async function run() {
  try {
    console.log('Starting loyalty system database migration...');
    
    // Add columns to shops table
    await addColumn('shops', 'loyalty_enabled TINYINT(1) DEFAULT 0');
    await addColumn('shops', 'loyalty_point_earn_rate DECIMAL(10,2) DEFAULT 100.00');
    await addColumn('shops', 'loyalty_point_value DECIMAL(10,2) DEFAULT 1.00');
    
    // Add columns to customers table
    await addColumn('customers', 'loyalty_points INT DEFAULT 0');
    
    // Add columns to sales table
    await addColumn('sales', 'points_earned INT DEFAULT 0');
    await addColumn('sales', 'points_redeemed INT DEFAULT 0');
    await addColumn('sales', 'points_redeemed_value DECIMAL(10,2) DEFAULT 0.00');
    
    console.log('Loyalty database migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

run();
