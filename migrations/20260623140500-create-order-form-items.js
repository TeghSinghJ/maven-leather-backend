'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_form_items', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      order_form_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'order_forms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'leather_products',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      description: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      qty: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      rate: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      batch_info: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      suggested_batches: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
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
    await queryInterface.dropTable('order_form_items');
  },
};
