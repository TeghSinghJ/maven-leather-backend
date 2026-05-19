'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add barcode to racks table
    await queryInterface.addColumn('racks', 'barcode', {
      type: Sequelize.STRING,
      unique: true,
      allowNull: true,
    });

    // Add index on rack barcode
    await queryInterface.addIndex('racks', ['barcode']);

    // Add barcode to hide_inventories table
    await queryInterface.addColumn('hide_inventories', 'barcode', {
      type: Sequelize.STRING,
      unique: true,
      allowNull: true,
    });

    // Add index on hide barcode
    await queryInterface.addIndex('hide_inventories', ['barcode']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('racks', ['barcode']);
    await queryInterface.removeIndex('hide_inventories', ['barcode']);

    // Remove columns
    await queryInterface.removeColumn('racks', 'barcode');
    await queryInterface.removeColumn('hide_inventories', 'barcode');
  },
};
