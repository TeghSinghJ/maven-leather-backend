"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("collection_prices");

    if (!table.price_list) {
      await queryInterface.addColumn("collection_prices", "price_list", {
        type: Sequelize.ENUM("WESTERN", "MARVIN"),
        allowNull: true,
        defaultValue: "WESTERN",
        comment: "Brand-specific price list",
      });
    }

    // Create a composite unique index for collection_series_id + price_type + price_list
    try {
      await queryInterface.addConstraint("collection_prices", {
        fields: ["collection_series_id", "price_type", "price_list"],
        type: "unique",
        name: "unique_collection_price_list",
      });
    } catch (err) {
      console.log("Note: Could not add unique constraint (may already exist):", err.message);
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeConstraint(
        "collection_prices",
        "unique_collection_price_list",
      );
    } catch (err) {
      console.log("Note: Constraint does not exist");
    }

    const table = await queryInterface.describeTable("collection_prices");
    if (table.price_list) {
      await queryInterface.removeColumn("collection_prices", "price_list");
    }
  },
};
