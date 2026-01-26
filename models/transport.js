'use strict';
module.exports = (sequelize, DataTypes) => {
  const TransportType = sequelize.define('TransportType', {
    name: { type: DataTypes.STRING, allowNull: false },
    parent_id: { type: DataTypes.INTEGER, allowNull: true },
    base_price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' }
  }, { tableName: 'transport_types' });

  TransportType.associate = (models) => {
    TransportType.hasMany(models.TransportType, {
      foreignKey: 'parent_id',
      as: 'subTypes'
    });

    TransportType.hasMany(models.Transport, {
      foreignKey: 'transport_type_id',
      as: 'transports'
    });
  };

  return TransportType;
};
