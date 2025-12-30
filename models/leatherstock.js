module.exports = (sequelize, DataTypes) => {
  const LeatherStock = sequelize.define(
    "LeatherStock",
    {
      product_id: DataTypes.INTEGER,
      total_qty: DataTypes.FLOAT,
      available_qty: DataTypes.FLOAT,
      reserved_qty: DataTypes.FLOAT,
    },
    { tableName: "leather_stocks" }
  );

  LeatherStock.associate = (models) => {
    LeatherStock.belongsTo(models.LeatherProduct, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return LeatherStock;
};
