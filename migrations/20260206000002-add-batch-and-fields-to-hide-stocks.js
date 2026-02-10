'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add batch_id foreign key to leather_hide_stocks (optional field)
    await queryInterface.addColumn('leather_hide_stocks', 'batch_id', {
      type: Sequelize.INTEGER,
      references: {
        model: 'batches',
        key: 'id',
      },
      onDelete: 'CASCADE',
    });

    // Add hide_code, grade, remarks for bulk upload support
    await queryInterface.addColumn('leather_hide_stocks', 'hide_code', {
      type: Sequelize.STRING,
    });

    await queryInterface.addColumn('leather_hide_stocks', 'grade', {
      type: Sequelize.STRING,
    });

    await queryInterface.addColumn('leather_hide_stocks', 'remarks', {
      type: Sequelize.TEXT,
    });

    await queryInterface.addIndex('leather_hide_stocks', ['batch_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('leather_hide_stocks', 'batch_id');
    await queryInterface.removeColumn('leather_hide_stocks', 'hide_code');
    await queryInterface.removeColumn('leather_hide_stocks', 'grade');
    await queryInterface.removeColumn('leather_hide_stocks', 'remarks');
  },
};
