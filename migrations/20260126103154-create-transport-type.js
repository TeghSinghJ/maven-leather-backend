'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transport_types', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING, allowNull: false },
      parent_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'transport_types', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      base_price: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.NOW }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('transport_types');
  }
};
