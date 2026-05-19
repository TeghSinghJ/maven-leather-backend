module.exports = (sequelize, DataTypes) => {
  const Rack = sequelize.define(
    'Rack',
    {
      name: {
        allowNull: false,
        type: DataTypes.STRING,
        unique: true,
        validate: {
          notEmpty: true,
        },
      },
      barcode: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
      },
      location: DataTypes.STRING,
      capacity: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE',
      },
    },
    {
      tableName: 'racks',
      underscored: false,
    }
  );

  Rack.associate = (models) => {
    Rack.hasMany(models.LeatherFold, {
      foreignKey: 'rack_id',
      as: 'leatherFolds',
    });
  };

  return Rack;
};
