"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("collection_prices", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },

      article_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      price_type: {
        type: Sequelize.ENUM("DP", "PRP", "ARCH"),
        allowNull: false,
      },

      price: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },

      collection_series_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "collection_series",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
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
    await queryInterface.dropTable("collection_prices");
  },
};
