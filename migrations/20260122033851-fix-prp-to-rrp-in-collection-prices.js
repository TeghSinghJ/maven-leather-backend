"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * STEP 1: Temporarily allow BOTH PRP and RRP
     */
    await queryInterface.changeColumn("collection_prices", "price_type", {
      type: Sequelize.ENUM("DP", "PRP", "RRP", "ARCH"),
      allowNull: false,
    });

    /**
     * STEP 2: Update data PRP → RRP
     */
    await queryInterface.bulkUpdate(
      "collection_prices",
      { price_type: "RRP" },
      { price_type: "PRP" }
    );

    /**
     * STEP 3: Remove PRP from ENUM
     */
    await queryInterface.changeColumn("collection_prices", "price_type", {
      type: Sequelize.ENUM("DP", "RRP", "ARCH"),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    /**
     * STEP 1: Re-add PRP to ENUM
     */
    await queryInterface.changeColumn("collection_prices", "price_type", {
      type: Sequelize.ENUM("DP", "PRP", "RRP", "ARCH"),
      allowNull: false,
    });

    /**
     * STEP 2: Revert data RRP → PRP
     */
    await queryInterface.bulkUpdate(
      "collection_prices",
      { price_type: "PRP" },
      { price_type: "RRP" }
    );

    /**
     * STEP 3: Remove RRP
     */
    await queryInterface.changeColumn("collection_prices", "price_type", {
      type: Sequelize.ENUM("DP", "PRP", "ARCH"),
      allowNull: false,
    });
  },
};
