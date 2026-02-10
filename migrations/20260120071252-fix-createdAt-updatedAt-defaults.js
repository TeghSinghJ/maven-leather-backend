'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('leather_products', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });

    await queryInterface.changeColumn('leather_products', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('leather_products', 'createdAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: null
    });

    await queryInterface.changeColumn('leather_products', 'updatedAt', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: null
    });
  }
};
