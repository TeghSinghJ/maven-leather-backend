module.exports = (sequelize, DataTypes) => {
  const LeatherHideStock = sequelize.define(
    "LeatherHideStock",
    {
      product_id: DataTypes.INTEGER,
      hide_id: DataTypes.STRING,
      batch_no: DataTypes.STRING,
      qty: DataTypes.FLOAT,
      status: DataTypes.ENUM("AVAILABLE", "RESERVED", "BLOCKED"),
    },
    {
      tableName: "leather_hide_stocks",
      underscored: true,
    }
  );

  LeatherHideStock.associate = (models) => {
    LeatherHideStock.belongsTo(models.LeatherProduct, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return LeatherHideStock;
};
