const XLSX = require("xlsx");
const { LeatherProduct, LeatherStock } = require("../../models");

exports.bulkUpload = async (req, res) => {
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  for (const row of rows) {
    const [product] = await LeatherProduct.findOrCreate({
      where: {
        leather_code: row.leather_code,
        color: row.color,
      },
      defaults: {
        leather_name: row.leather_name,
      },
    });

    const [stock] = await LeatherStock.findOrCreate({
      where: { product_id: product.id },
      defaults: {
        total_qty: 0,
        available_qty: 0,
        reserved_qty: 0,
      },
    });

    stock.total_qty += Number(row.quantity);
    stock.available_qty += Number(row.quantity);
    await stock.save();
  }

  res.json({ message: "Bulk stock uploaded successfully" });
};
