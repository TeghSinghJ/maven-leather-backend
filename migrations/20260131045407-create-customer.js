'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },

      customer_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      whatsapp_number: {
        type: Sequelize.STRING,
      },

      contact_number: {
        type: Sequelize.STRING,
      },

      address: {
        type: Sequelize.STRING,
      },

      state: {
        type: Sequelize.STRING,
      },

      gst_number: {
        type: Sequelize.STRING,
      },

      pin_code: {
        type: Sequelize.STRING,
      },

      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE',
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customers');
  },
};
