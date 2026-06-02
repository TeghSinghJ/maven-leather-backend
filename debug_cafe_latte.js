const { LeatherProduct, LeatherStock, sequelize } = require('./models');

async function checkCafeLatte() {
  try {
    // Query for cafe latte products
    const products = await LeatherProduct.findAll({
      where: {
        status: 'ACTIVE'
      },
      include: [
        {
          model: LeatherStock,
          as: 'stock',
          where: { location: 'Bangalore' },
          required: false
        }
      ]
    });

    // Find cafe latte
    const cafeLatte = products.filter(p => 
      p.leather_code?.toLowerCase().includes('cafe') || 
      p.leather_code?.toLowerCase().includes('latte') ||
      p.color?.toLowerCase().includes('cafe') ||
      p.color?.toLowerCase().includes('latte')
    );

    console.log('\n🔍 CAFE LATTE PRODUCTS FOUND:');
    console.log(`Total matches: ${cafeLatte.length}`);
    cafeLatte.forEach((p, idx) => {
      console.log(`\n[${idx + 1}] Product ID: ${p.id}`);
      console.log(`    Code: ${p.leather_code}`);
      console.log(`    Color: ${p.color}`);
      console.log(`    Collection Series: ${p.collection_series_id}`);
      console.log(`    Stock Location: ${p.stock?.location}`);
      console.log(`    Stock Qty: ${p.stock?.total_qty}`);
    });

    // Check for duplicates by ID
    const ids = cafeLatte.map(p => p.id);
    const uniqueIds = new Set(ids);
    console.log(`\n📊 Total product IDs: ${ids.length}`);
    console.log(`📊 Unique product IDs: ${uniqueIds.size}`);
    
    if (ids.length > uniqueIds.size) {
      console.log('⚠️  DUPLICATES DETECTED!');
    }

    // Show leather_stocks table for this product
    if (cafeLatte.length > 0) {
      const stockData = await LeatherStock.findAll({
        where: { product_id: cafeLatte[0].id }
      });
      console.log(`\n📦 LEATHER_STOCKS TABLE FOR CAFE LATTE (Product ID: ${cafeLatte[0].id}):`);
      stockData.forEach((s, idx) => {
        console.log(`[${idx + 1}] Location: ${s.location}, Total: ${s.total_qty}, Available: ${s.available_qty}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCafeLatte();
