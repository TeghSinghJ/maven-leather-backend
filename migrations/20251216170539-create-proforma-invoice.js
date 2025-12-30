'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("proforma_invoices", {
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
      address: {
        type: Sequelize.STRING,
      },
      state: {
        type: Sequelize.STRING,
      },
      gst_number: {
        type: Sequelize.STRING,
      },
      contact_number: {
        type: Sequelize.STRING,
      },
      pin_code: {
        type: Sequelize.STRING,
      },
      status: {
        type: Sequelize.ENUM("ACTIVE", "EXPIRED", "CONFIRMED"),
        defaultValue: "ACTIVE",
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
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

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("proforma_invoices");
  },
};
