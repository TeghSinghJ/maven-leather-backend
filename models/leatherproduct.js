module.exports = (sequelize, DataTypes) => {
  const LeatherProduct = sequelize.define(
    "LeatherProduct",
    {
      collection_series_id: DataTypes.INTEGER,
      leather_code: DataTypes.STRING,
      color: DataTypes.STRING,
      description: DataTypes.TEXT,
      image_url: DataTypes.STRING,
      status: DataTypes.ENUM("ACTIVE", "INACTIVE"),
    },
    { tableName: "leather_products" }
  );

  LeatherProduct.associate = (models) => {
    // LeatherStock association
    LeatherProduct.hasOne(models.LeatherStock, {
      foreignKey: "product_id",
      as: "stock",
    });

    // Optional: CollectionSeries association
    LeatherProduct.belongsTo(models.CollectionSeries, {
      foreignKey: "collection_series_id",
      as: "series",
    });
  };

  return LeatherProduct;
};
