module.exports = (sequelize, DataTypes) => {
  const LeatherFold = sequelize.define(
    'LeatherFold',
    {
      barcode: {
        allowNull: false,
        type: DataTypes.STRING,
        unique: true,
        validate: {
          notEmpty: true,
        },
      },
      article: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      color: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      batch: {
        allowNull: false,
        type: DataTypes.STRING,
      },
      rack_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
      },
      total_hides: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      total_sqft: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'SOLD', 'ARCHIVED'),
        defaultValue: 'ACTIVE',
      },
      location: {
        type: DataTypes.ENUM('Bangalore', 'Delhi', 'Mumbai'),
        defaultValue: 'Bangalore',
        comment: 'Collection location/branch',
      },
      notes: DataTypes.TEXT,
    },
    {
      tableName: 'leather_folds',
      underscored: false,
    }
  );

  LeatherFold.associate = (models) => {
    LeatherFold.belongsTo(models.Rack, {
      foreignKey: 'rack_id',
      as: 'rack',
    });

    LeatherFold.hasMany(models.HideInventory, {
      foreignKey: 'leather_fold_id',
      as: 'hides',
    });
  };

  return LeatherFold;
};
