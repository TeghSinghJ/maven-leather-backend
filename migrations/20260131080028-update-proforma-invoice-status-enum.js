"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE proforma_invoices
      MODIFY COLUMN status ENUM(
        'ACTIVE',
        'PENDING_APPROVAL',
        'CONFIRMED',
        'EXPIRED',
        'CANCELLED'
      ) NOT NULL DEFAULT 'PENDING_APPROVAL'
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE proforma_invoices
      MODIFY COLUMN status ENUM(
        'ACTIVE',
        'CONFIRMED',
        'EXPIRED',
        'CANCELLED'
      ) NOT NULL DEFAULT 'ACTIVE'
    `);
  },
};
