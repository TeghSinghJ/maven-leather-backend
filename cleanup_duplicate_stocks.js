const { LeatherStock, sequelize } = require('./models');

async function cleanupDuplicateStocks() {
  try {
    console.log('🧹 STARTING CLEANUP OF DUPLICATE STOCKS...\n');

    // Find all product-location combos with duplicates
    const duplicates = await sequelize.query(`
      SELECT product_id, location, COUNT(*) as count
      FROM leather_stocks
      GROUP BY product_id, location
      HAVING count > 1;
    `, { type: sequelize.QueryTypes.SELECT });

    console.log(`Found ${duplicates.length} product-location combos with duplicates\n`);

    let totalDeleted = 0;

    // For each duplicate combo, delete all but the most recent
    for (const dup of duplicates) {
      const { product_id, location } = dup;
      
      // Get all stocks for this product-location, ordered by createdAt DESC
      const stocks = await LeatherStock.findAll({
        where: { product_id, location },
        order: [['createdAt', 'DESC']],
        raw: true
      });

      // Keep the first (most recent) and delete the rest
      if (stocks.length > 1) {
        const idsToDelete = stocks.slice(1).map(s => s.id);
        const deleted = await LeatherStock.destroy({
          where: { id: idsToDelete }
        });
        totalDeleted += deleted;
        console.log(`✅ Product ${product_id} (${location}): Kept 1, Deleted ${deleted}`);
      }
    }

    console.log(`\n🎉 CLEANUP COMPLETE!`);
    console.log(`Total duplicate entries deleted: ${totalDeleted}`);

    // Verify
    const remaining = await sequelize.query(`
      SELECT COUNT(*) as duplicate_count
      FROM (
        SELECT product_id, location, COUNT(*) as count
        FROM leather_stocks
        GROUP BY product_id, location
        HAVING count > 1
      ) AS T;
    `, { type: sequelize.QueryTypes.SELECT });

    const duplicateCount = remaining[0].duplicate_count;
    if (duplicateCount === 0) {
      console.log('\n✨ All duplicates removed! Database is clean now.');
    } else {
      console.log(`\n⚠️  Still ${duplicateCount} duplicates remaining.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDuplicateStocks();
