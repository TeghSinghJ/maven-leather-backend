module.exports = (sequelize, DataTypes) => {
  const MainCollection = sequelize.define(
    "MainCollection",
    {
      name: DataTypes.STRING,
      status: DataTypes.ENUM("ACTIVE", "INACTIVE"),
    },
    {
      tableName: "main_collections",
    }
  );

  MainCollection.associate = (models) => {
    MainCollection.hasMany(models.SubCollection, {
      foreignKey: "main_collection_id",
      as: "subCollections",
    });
  };

  return MainCollection;
};
