'use strict';

module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    'Customer',
    {
      customer_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      whatsapp_number: DataTypes.STRING,
      contact_number: DataTypes.STRING,
      address: DataTypes.STRING,
      state: DataTypes.STRING,
      gst_number: DataTypes.STRING,
      pin_code: DataTypes.STRING,
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE',
      },
    },
    {
      tableName: 'customers',
    }
  );

  Customer.associate = (models) => {
    Customer.hasMany(models.ProformaInvoice, {
      foreignKey: 'customer_id',
      as: 'proformaInvoices',
    });
  };

  return Customer;
};
