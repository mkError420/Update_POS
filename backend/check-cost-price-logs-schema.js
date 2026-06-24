const db = require('./config/db');

async function checkSchema() {
  try {
    const [cols] = await db.query('SHOW COLUMNS FROM cost_price_logs');
    console.log('cost_price_logs columns:');
    cols.forEach(c => console.log(`  ${c.Field}: ${c.Type}`));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkSchema();
