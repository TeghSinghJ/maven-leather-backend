'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('racks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING,
        unique: true,
        comment: 'Rack identifier (e.g., RACK-A1, RACK-B2)',
      },
      location: {
        type: Sequelize.STRING,
        comment: 'Physical location of rack (e.g., Floor 1, Section A)',
      },
      capacity: {
        type: Sequelize.FLOAT,
        defaultValue: 0,
        comment: 'Total capacity in sq.ft',
      },
      status: {
        allowNull: false,
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        defaultValue: 'ACTIVE',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('racks', ['name']);
    await queryInterface.addIndex('racks', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('racks');
  },
};
