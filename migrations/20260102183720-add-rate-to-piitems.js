module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("pi_items", "rate", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("pi_items", "rate");
  },
};
