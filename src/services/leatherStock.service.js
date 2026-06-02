const { LeatherHideStock, LeatherStock } = require("../../models");

const recalculateLeatherStock = async (productId) => {
  const hides = await LeatherHideStock.findAll({
    where: { product_id: productId },
    attributes: ["qty", "status"],
    raw: true,
  });

  let total_qty = 0;
  let available_qty = 0;
  let reserved_qty = 0;

  for (const hide of hides) {
    total_qty += hide.qty;

    if (hide.status === "AVAILABLE") {
      available_qty += hide.qty;
    } else {
      reserved_qty += hide.qty;
    }
  }

  // Preserve an existing location if one already exists for this product.
  let stock = await LeatherStock.findOne({
    where: { product_id: productId },
  });

  if (stock) {
    stock.total_qty = total_qty;
    stock.available_qty = available_qty;
    stock.reserved_qty = reserved_qty;
    await stock.save();
  } else {
    await LeatherStock.create({
      product_id: productId,
      total_qty,
      available_qty,
      reserved_qty,
      location: 'Bangalore',
    });
  }
};

module.exports = { recalculateLeatherStock };
