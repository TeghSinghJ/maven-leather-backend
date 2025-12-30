module.exports = (sequelize, DataTypes) => {
  const SubCollection = sequelize.define(
    "SubCollection",
    {
      name: DataTypes.STRING,
      main_collection_id: DataTypes.INTEGER,
    },
    {
      tableName: "sub_collections",
    }
  );

  SubCollection.associate = (models) => {
    SubCollection.belongsTo(models.MainCollection, {
      foreignKey: "main_collection_id",
      as: "mainCollection",
    });

    SubCollection.hasMany(models.CollectionSeries, {
      foreignKey: "sub_collection_id",
      as: "series",
    });
  };

  return SubCollection;
};
