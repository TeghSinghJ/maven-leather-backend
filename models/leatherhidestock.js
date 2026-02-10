module.exports = (sequelize, DataTypes) => {
  const LeatherHideStock = sequelize.define(
    "LeatherHideStock",
    {
      product_id: DataTypes.INTEGER,
      hide_id: DataTypes.STRING,
      batch_no: DataTypes.STRING,
      batch_id: DataTypes.INTEGER,
      qty: DataTypes.FLOAT,
      hide_code: DataTypes.STRING,
      grade: DataTypes.STRING,
      remarks: DataTypes.TEXT,
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

    LeatherHideStock.belongsTo(models.Batch, {
      foreignKey: "batch_id",
      as: "batch",
    });
  };

  return LeatherHideStock;
};
