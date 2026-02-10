'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add created_by to proforma_invoices
    await queryInterface.addColumn('proforma_invoices', 'created_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add location to users
    await queryInterface.addColumn('users', 'location', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'DEFAULT',
    });

    // Create index for faster filtering by created_by
    await queryInterface.addIndex('proforma_invoices', ['created_by']);
    
    // Create index for filtering by location and created_by
    await queryInterface.addIndex('proforma_invoices', ['created_by', 'status']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('proforma_invoices', ['created_by', 'status']);
    await queryInterface.removeIndex('proforma_invoices', ['created_by']);
    
    // Remove columns
    await queryInterface.removeColumn('proforma_invoices', 'created_by');
    await queryInterface.removeColumn('users', 'location');
  },
};
