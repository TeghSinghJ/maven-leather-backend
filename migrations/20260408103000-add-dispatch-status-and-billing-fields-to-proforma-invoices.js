'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('proforma_invoices');

    await queryInterface.changeColumn('proforma_invoices', 'status', {
      type: Sequelize.ENUM(
        'ACTIVE',
        'PENDING_APPROVAL',
        'CONFIRMED',
        'DISPATCHED',
        'EXPIRED',
        'CANCELLED'
      ),
      allowNull: false,
      defaultValue: 'PENDING_APPROVAL',
    });

    if (!table.invoice_bill_number) {
      await queryInterface.addColumn('proforma_invoices', 'invoice_bill_number', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!table.confirmed_at) {
      await queryInterface.addColumn('proforma_invoices', 'confirmed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.dispatched_at) {
      await queryInterface.addColumn('proforma_invoices', 'dispatched_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.cancelled_at) {
      await queryInterface.addColumn('proforma_invoices', 'cancelled_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('proforma_invoices');

    await queryInterface.changeColumn('proforma_invoices', 'status', {
      type: Sequelize.ENUM(
        'ACTIVE',
        'PENDING_APPROVAL',
        'CONFIRMED',
        'EXPIRED',
        'CANCELLED'
      ),
      allowNull: false,
      defaultValue: 'PENDING_APPROVAL',
    });

    if (table.invoice_bill_number) {
      await queryInterface.removeColumn('proforma_invoices', 'invoice_bill_number');
    }

    if (table.confirmed_at) {
      await queryInterface.removeColumn('proforma_invoices', 'confirmed_at');
    }

    if (table.dispatched_at) {
      await queryInterface.removeColumn('proforma_invoices', 'dispatched_at');
    }

    if (table.cancelled_at) {
      await queryInterface.removeColumn('proforma_invoices', 'cancelled_at');
    }
  },
};
