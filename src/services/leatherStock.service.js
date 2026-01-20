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

  await LeatherStock.upsert({
    product_id: productId,
    total_qty,
    available_qty,
    reserved_qty,
  });
};

module.exports = { recalculateLeatherStock };
