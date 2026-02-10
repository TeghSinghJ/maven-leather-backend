'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('batches', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      batch_no: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'leather_products',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      collection_series_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'collection_series',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      description: {
        type: Sequelize.TEXT,
      },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'CLOSED', 'ARCHIVED'),
        defaultValue: 'ACTIVE',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('batches', ['product_id']);
    await queryInterface.addIndex('batches', ['collection_series_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('batches');
  },
};
