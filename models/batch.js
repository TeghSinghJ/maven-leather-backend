module.exports = (sequelize, DataTypes) => {
  const Batch = sequelize.define(
    "Batch",
    {
      batch_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      collection_series_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      description: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM("ACTIVE", "CLOSED", "ARCHIVED"),
        defaultValue: "ACTIVE",
      },
    },
    {
      tableName: "batches",
      underscored: true,
    }
  );

  Batch.associate = (models) => {
    Batch.belongsTo(models.LeatherProduct, {
      foreignKey: "product_id",
      as: "product",
    });

    Batch.belongsTo(models.CollectionSeries, {
      foreignKey: "collection_series_id",
      as: "series",
    });

    Batch.hasMany(models.LeatherHideStock, {
      foreignKey: "batch_id",
      as: "hides",
    });
  };

  return Batch;
};
