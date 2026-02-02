"use strict";
const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface, Sequelize) {
    const passwordHash = await bcrypt.hash("admin", 10);

    return queryInterface.bulkInsert("users", [
      {
        name: "admin",
        email: "admin@marvin.com",
        password: passwordHash,
        mobile_number: "9999999999",
        role: "ADMIN",
        is_active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete("users", { email: "admin@example.com" });
  },
};
