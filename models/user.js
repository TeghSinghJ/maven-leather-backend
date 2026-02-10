"use strict";

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      name: DataTypes.STRING,
      email: DataTypes.STRING,
      password: DataTypes.STRING,
      mobile_number: DataTypes.STRING,
      role: {
        type: DataTypes.ENUM("ADMIN", "BUSINESS_EXECUTIVE"),
        defaultValue: "BUSINESS_EXECUTIVE",
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "DEFAULT",
        comment: "Location/Branch of the user (e.g., Bangalore, Delhi)",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "users",
    }
  );

  User.associate = (models) => {
  };

  return User;
};
