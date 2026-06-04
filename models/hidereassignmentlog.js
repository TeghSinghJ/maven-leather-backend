"use strict";

module.exports = (sequelize, DataTypes) => {
  const HideReassignmentLog = sequelize.define(
    "HideReassignmentLog",
    {
      from_pi_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      to_pi_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      hide_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      action: {
        type: DataTypes.ENUM("REASSIGNED", "UNLOCKED"),
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "hide_reassignment_logs",
    }
  );

  HideReassignmentLog.associate = (models) => {
    HideReassignmentLog.belongsTo(models.ProformaInvoice, {
      foreignKey: "from_pi_id",
      as: "fromPI",
    });
    HideReassignmentLog.belongsTo(models.ProformaInvoice, {
      foreignKey: "to_pi_id",
      as: "toPI",
    });
    HideReassignmentLog.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return HideReassignmentLog;
};
