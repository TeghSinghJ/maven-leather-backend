"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("collection_series", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      sub_collection_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "sub_collections",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
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
    await queryInterface.dropTable("collection_series");
  },
};
