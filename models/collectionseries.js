module.exports = (sequelize, DataTypes) => {
  const CollectionSeries = sequelize.define(
    "CollectionSeries",
    {
      name: DataTypes.STRING,
      sub_collection_id: DataTypes.INTEGER,
    },
    {
      tableName: "collection_series",
    }
  );

  CollectionSeries.associate = (models) => {
    CollectionSeries.belongsTo(models.SubCollection, {
      foreignKey: "sub_collection_id",
      as: "subCollection",
    });

    CollectionSeries.hasMany(models.LeatherProduct, {
      foreignKey: "collection_series_id",
      as: "leatherProducts",
    });
  };

  return CollectionSeries;
};
