module.exports = (sequelize, DataTypes) => {
  const LeatherStock = sequelize.define(
    "LeatherStock",
    {
      product_id: DataTypes.INTEGER,
      total_qty: DataTypes.FLOAT,
      available_qty: DataTypes.FLOAT,
      reserved_qty: DataTypes.FLOAT,
      location: {
        type: DataTypes.ENUM('Bangalore', 'Delhi', 'Mumbai'),
        defaultValue: 'Bangalore',
        comment: 'Stock location/branch (Bangalore, Delhi, Mumbai)',
      },
      estimated_delivery_date: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Estimated delivery date for low stock items',
      },
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
