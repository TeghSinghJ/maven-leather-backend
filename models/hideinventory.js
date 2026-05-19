module.exports = (sequelize, DataTypes) => {
  const HideInventory = sequelize.define(
    'HideInventory',
    {
      leather_fold_id: {
        allowNull: false,
        type: DataTypes.INTEGER,
      },
      hide_number: {
        allowNull: false,
        type: DataTypes.INTEGER,
      },
      barcode: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
      size_sqft: {
        allowNull: false,
        type: DataTypes.FLOAT,
      },
      quality_grade: DataTypes.STRING,
      status: {
        type: DataTypes.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED'),
        defaultValue: 'AVAILABLE',
      },
      sold_at: DataTypes.DATE,
      sold_to: DataTypes.STRING,
      remarks: DataTypes.TEXT,
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'createdAt',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updatedAt',
      },
    },
    {
      tableName: 'hide_inventories',
      timestamps: true,
      underscored: false,
    }
  );

  HideInventory.associate = (models) => {
    HideInventory.belongsTo(models.LeatherFold, {
      foreignKey: 'leather_fold_id',
      as: 'leatherFold',
    });
  };

  return HideInventory;
};
