const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function addInventoryAdjustmentsTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'multitenant_pos'
  });

  try {
    console.log('Creating inventory_adjustments table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`inventory_adjustments\` (
        \`id\` INT AUTO_INCREMENT,
        \`shop_id\` INT NOT NULL,
        \`product_id\` INT NOT NULL,
        \`previous_quantity\` INT NOT NULL,
        \`adjusted_quantity\` INT NOT NULL,
        \`difference\` INT NOT NULL,
        \`adjustment_type\` ENUM('increase', 'decrease') NOT NULL,
        \`reason\` VARCHAR(255) NOT NULL,
        \`notes\` TEXT NULL,
        \`adjusted_by\` INT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_inventory_adjustments_shop\` (\`shop_id\`),
        INDEX \`idx_inventory_adjustments_product\` (\`product_id\`),
        INDEX \`idx_inventory_adjustments_date\` (\`created_at\`),
        CONSTRAINT \`fk_inventory_adjustments_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_inventory_adjustments_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_inventory_adjustments_user\` FOREIGN KEY (\`adjusted_by\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ inventory_adjustments table created successfully!');
    
    console.log('\n✅ Inventory adjustments table migration completed!');
  } catch (error) {
    console.error('Error creating table:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

addInventoryAdjustmentsTable();
