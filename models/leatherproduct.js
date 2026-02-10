module.exports = (sequelize, DataTypes) => {
  const LeatherProduct = sequelize.define(
    "LeatherProduct",
    {
      collection_series_id: DataTypes.INTEGER,
      leather_code: DataTypes.STRING,
      color: DataTypes.STRING,
      hsn_code: {
        type: DataTypes.STRING,
        defaultValue: '4107',
      },
      description: DataTypes.TEXT,
      image_url: DataTypes.STRING,
      status: DataTypes.ENUM("ACTIVE", "INACTIVE"),
    },
    { tableName: "leather_products" }
  );

  LeatherProduct.associate = (models) => {
    LeatherProduct.hasOne(models.LeatherStock, {
      foreignKey: "product_id",
      as: "stock",
    });

    LeatherProduct.hasMany(models.LeatherHideStock, {
      foreignKey: "product_id",
      as: "batches",
    });

    LeatherProduct.belongsTo(models.CollectionSeries, {
      foreignKey: "collection_series_id",
      as: "series",
    });
  };

  return LeatherProduct;
};
