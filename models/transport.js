'use strict';

const { table } = require("pdfkit");

module.exports = (sequelize, DataTypes) => {
  const Transport = sequelize.define('Transport', {
    name: { type: DataTypes.STRING, allowNull: false },
    transport_type_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' }
  }, { tableName: 'transports' });

  Transport.associate = (models) => {
    Transport.belongsTo(models.TransportType, {
      foreignKey: 'transport_type_id',
      as: 'type'
    });
  };

  return Transport;
};
