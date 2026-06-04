'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('collection_series', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Location/branch for this collection series (Bangalore, Delhi, Mumbai, Western Colours, Italy)',
    });

    await queryInterface.changeColumn('leather_stocks', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Stock location/branch (Bangalore, Delhi, Mumbai, Western Colours, Italy)',
    });

    await queryInterface.changeColumn('leather_folds', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai', 'Western Colours', 'Italy'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Collection location/branch',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('collection_series', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Location/branch for this collection series (Bangalore, Delhi, Mumbai)',
    });

    await queryInterface.changeColumn('leather_stocks', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Stock location/branch (Bangalore, Delhi, Mumbai)',
    });

    await queryInterface.changeColumn('leather_folds', 'location', {
      type: Sequelize.ENUM('Bangalore', 'Delhi', 'Mumbai'),
      defaultValue: 'Bangalore',
      allowNull: false,
      comment: 'Collection location/branch',
    });
  },
};
