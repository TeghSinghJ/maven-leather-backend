module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('proforma_invoices', 'parent_pi_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Original PI id for revision tracking',
    });

    await queryInterface.addColumn('proforma_invoices', 'revision_no', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Revision number for this PI',
    });

    await queryInterface.addColumn('proforma_invoices', 'revision_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Reason for the PI revision',
    });

    await queryInterface.addColumn('proforma_invoices', 'is_revision', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether this PI is a revised version of an earlier PI',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('proforma_invoices', 'parent_pi_id');
    await queryInterface.removeColumn('proforma_invoices', 'revision_no');
    await queryInterface.removeColumn('proforma_invoices', 'revision_reason');
    await queryInterface.removeColumn('proforma_invoices', 'is_revision');
  },
};
