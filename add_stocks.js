const { LeatherStock, sequelize } = require("./models");

async function addStocksForLocations() {
  try {
    // Get all existing stocks (assuming they are for Bangalore)
    const existingStocks = await LeatherStock.findAll();

    const locations = ['Delhi', 'Mumbai'];

    for (const stock of existingStocks) {
      for (const location of locations) {
        // Check if stock already exists for this location
        const existing = await LeatherStock.findOne({
          where: { product_id: stock.product_id, location }
        });

        if (!existing) {
          await LeatherStock.create({
            product_id: stock.product_id,
            total_qty: stock.total_qty,
            available_qty: stock.available_qty,
            reserved_qty: stock.reserved_qty,
            location,
            estimated_delivery_date: stock.estimated_delivery_date
          });
          console.log(`Created stock for product ${stock.product_id} in ${location}`);
        } else {
          console.log(`Stock already exists for product ${stock.product_id} in ${location}`);
        }
      }
    }

    console.log('Done adding stocks for Delhi and Mumbai');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

addStocksForLocations();