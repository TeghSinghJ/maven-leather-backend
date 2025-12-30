"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("leather_products", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      leather_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      leather_code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      color: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
      },
      image_url: {
        type: Sequelize.STRING,
      },
      status: {
        type: Sequelize.ENUM("ACTIVE", "INACTIVE"),
        defaultValue: "ACTIVE",
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

    // ✅ UNIQUE CONSTRAINT (leather_code + color)
    await queryInterface.addConstraint("leather_products", {
      fields: ["leather_code", "color"],
      type: "unique",
      name: "unique_leather_code_color",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("leather_products");
  },
};
