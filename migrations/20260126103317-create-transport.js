'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transports', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING, allowNull: false },
      transport_type_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false, 
        references: { model: 'transport_types', key: 'id' }, 
        onUpdate: 'CASCADE', 
        onDelete: 'RESTRICT' 
      },
      status: { type: Sequelize.ENUM('ACTIVE','INACTIVE'), defaultValue: 'ACTIVE' },
      createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.NOW }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('transports');
  }
};
