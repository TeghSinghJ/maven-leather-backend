const { LeatherStock, sequelize } = require('./models');

async function checkDuplicateStocks() {
  try {
    // Find products with duplicate stocks for the same location
    const result = await sequelize.query(`
      SELECT product_id, location, COUNT(*) as count
      FROM leather_stocks
      GROUP BY product_id, location
      HAVING count > 1
      ORDER BY count DESC;
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('\n🔍 DUPLICATE STOCKS FOUND:');
    console.log(`Total product-location combos with duplicates: ${result.length}`);
    
    result.forEach((row, idx) => {
      console.log(`\n[${idx + 1}] Product ID ${row.product_id}, Location: ${row.location} - ${row.count} entries`);
    });

    // Get details for product 806 and 993
    console.log('\n\n📦 DETAILS FOR PRODUCT 806 (Italian Latte):');
    const stocks806 = await LeatherStock.findAll({
      where: { product_id: 806 }
    });
    stocks806.forEach((s, idx) => {
      console.log(`[${idx + 1}] ID: ${s.id}, Location: ${s.location}, Total: ${s.total_qty}, Created: ${s.createdAt}`);
    });

    console.log('\n📦 DETAILS FOR PRODUCT 993 (Cafe Latte):');
    const stocks993 = await LeatherStock.findAll({
      where: { product_id: 993 }
    });
    stocks993.forEach((s, idx) => {
      console.log(`[${idx + 1}] ID: ${s.id}, Location: ${s.location}, Total: ${s.total_qty}, Created: ${s.createdAt}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDuplicateStocks();
