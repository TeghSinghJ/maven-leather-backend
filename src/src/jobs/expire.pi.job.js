const cron = require("node-cron");
const { ProformaInvoice, PIItem, LeatherStock, sequelize } = require("../../../models");
const { Op } = require("sequelize");

const expirePIs = async () => {
  const t = await sequelize.transaction();
  try {
    const expiredPIs = await ProformaInvoice.findAll({
      where: {
        status: "ACTIVE",
        expires_at: { [Op.lt]: new Date() },
      },
      include: [{ model: PIItem, as: "items" }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    for (const pi of expiredPIs) {
      for (const item of pi.items) {
        const stock = await LeatherStock.findOne({
          where: { product_id: item.product_id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        stock.available_qty += item.qty;
        stock.reserved_qty -= item.qty;
        await stock.save({ transaction: t });
      }

      pi.status = "EXPIRED";
      await pi.save({ transaction: t });
    }

    await t.commit();
    console.log(`Expired ${expiredPIs.length} PIs`);
  } catch (err) {
    await t.rollback();
    console.error("PI expiry job failed", err);
  }
};

cron.schedule("0 * * * *", expirePIs);

module.exports = expirePIs;
