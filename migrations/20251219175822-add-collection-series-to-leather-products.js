"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1️⃣ Add column (nullable first to avoid breaking existing rows)
    await queryInterface.addColumn("leather_products", "collection_series_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: "id",
    });

    // 2️⃣ Add foreign key constraint
    await queryInterface.addConstraint("leather_products", {
      fields: ["collection_series_id"],
      type: "foreign key",
      name: "fk_leather_products_collection_series",
      references: {
        table: "collection_series",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    // Remove FK first
    await queryInterface.removeConstraint(
      "leather_products",
      "fk_leather_products_collection_series"
    );

    // Remove column
    await queryInterface.removeColumn(
      "leather_products",
      "collection_series_id"
    );
  },
};
