const XLSX = require("xlsx");
const { Op } = require("sequelize");
const { LeatherProduct, LeatherStock } = require("../../models");
const { sequelize } = require("../../models");

exports.bulkUpload = async (req, res) => {
  const { series_id } = req.body || {};

  if (!series_id) {
    return res.status(400).json({ error: "Series ID is required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "CSV/Excel file is required" });
  }

  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const transaction = await sequelize.transaction();

  try {
    for (const row of rows) {
      // 🔑 Normalize Excel fields
      const leather_code = row.leather_code || row["leather_code"];
      const color = row.color || row.colour_name || row.colour;
      const description = row.leather_name || "";
      const quantity = Number(row.quantity || row.total_stock_sqft || 0);

      if (!leather_code || !color) {
        console.log("Skipping invalid row:", row);
        continue;
      }

      // ✅ Create / find product
      const [product] = await LeatherProduct.findOrCreate({
        where: {
          leather_code,
          color,
          collection_series_id: series_id,
        },
        defaults: {
          description,
          status: "ACTIVE",
        },
        transaction,
      });

      const stockLocation = req.body.location || 'Bangalore';
      // ✅ Create / update stock using product_id + location to avoid duplicate stock rows
      let stock = await LeatherStock.findOne({
        where: { product_id: product.id, location: stockLocation },
        transaction,
      });

      if (!stock) {
        stock = await LeatherStock.findOne({
          where: {
            product_id: product.id,
            location: { [Op.is]: null },
          },
          transaction,
        });
      }

      if (stock) {
        stock.total_qty += quantity;
        stock.available_qty += quantity;
        await stock.save({ transaction });
      } else {
        stock = await LeatherStock.create(
          {
            product_id: product.id,
            location: stockLocation,
            total_qty: quantity,
            available_qty: quantity,
            reserved_qty: 0,
          },
          { transaction }
        );
      }
    }

    await transaction.commit();
    res.json({ message: "Bulk products uploaded successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
