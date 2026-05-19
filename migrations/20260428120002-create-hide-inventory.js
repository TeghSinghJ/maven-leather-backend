'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('hide_inventories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      leather_fold_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: {
          model: 'leather_folds',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      hide_number: {
        allowNull: false,
        type: Sequelize.INTEGER,
        comment: 'Hide sequence number (1, 2, 3, etc.)',
      },
      size_sqft: {
        allowNull: false,
        type: Sequelize.FLOAT,
        comment: 'Size in square feet (e.g., 45.8)',
      },
      quality_grade: {
        type: Sequelize.STRING,
        comment: 'Quality grade (e.g., A, B, C)',
      },
      status: {
        allowNull: false,
        type: Sequelize.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED'),
        defaultValue: 'AVAILABLE',
      },
      sold_at: {
        type: Sequelize.DATE,
        comment: 'Date when hide was sold',
      },
      sold_to: {
        type: Sequelize.STRING,
        comment: 'Customer name or reference',
      },
      remarks: {
        type: Sequelize.TEXT,
        comment: 'Additional remarks about the hide',
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

    await queryInterface.addIndex('hide_inventories', ['leather_fold_id']);
    await queryInterface.addIndex('hide_inventories', ['status']);
    await queryInterface.addIndex('hide_inventories', ['size_sqft']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('hide_inventories');
  },
};
