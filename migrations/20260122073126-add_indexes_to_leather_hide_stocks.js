module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addIndex("leather_hide_stocks", ["product_id"]);
    await queryInterface.addIndex("leather_hide_stocks", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("leather_hide_stocks", ["product_id"]);
    await queryInterface.removeIndex("leather_hide_stocks", ["status"]);
  },
};
