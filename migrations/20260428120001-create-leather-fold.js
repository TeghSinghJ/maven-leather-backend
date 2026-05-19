'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('leather_folds', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      barcode: {
        allowNull: false,
        type: Sequelize.STRING,
        unique: true,
        comment: 'Unique barcode (e.g., LTH-0001)',
      },
      article: {
        allowNull: false,
        type: Sequelize.STRING,
        comment: 'Article name/code',
      },
      color: {
        allowNull: false,
        type: Sequelize.STRING,
        comment: 'Color of leather',
      },
      batch: {
        allowNull: false,
        type: Sequelize.STRING,
        comment: 'Batch number',
      },
      rack_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'racks',
          key: 'id',
        },
        onDelete: 'RESTRICT',
      },
      total_hides: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of hides in this fold',
      },
      total_sqft: {
        type: Sequelize.FLOAT,
        defaultValue: 0,
        comment: 'Total sq.ft of all hides',
      },
      status: {
        allowNull: false,
        type: Sequelize.ENUM('ACTIVE', 'SOLD', 'ARCHIVED'),
        defaultValue: 'ACTIVE',
      },
      notes: {
        type: Sequelize.TEXT,
        comment: 'Additional notes',
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

    await queryInterface.addIndex('leather_folds', ['barcode']);
    await queryInterface.addIndex('leather_folds', ['article', 'color', 'batch']);
    await queryInterface.addIndex('leather_folds', ['rack_id']);
    await queryInterface.addIndex('leather_folds', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('leather_folds');
  },
};
