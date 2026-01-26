'use strict';
module.exports = (sequelize, DataTypes) => {
  const Transport = sequelize.define('Transport', {
    name: { type: DataTypes.STRING, allowNull: false },
    transport_type_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' }
  }, {});

  Transport.associate = (models) => {
    Transport.belongsTo(models.TransportType, {
      foreignKey: 'transport_type_id',
      as: 'type'
    });
  };

  return Transport;
};
