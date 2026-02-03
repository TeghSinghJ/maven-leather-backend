'use strict';

const XLSX = require('xlsx');
const { Customer, sequelize } = require('../../models');

exports.bulkUpload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV/Excel file is required' });

  const transaction = await sequelize.transaction();

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(sheet);

    rows = rows.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        newRow[key.trim()] = typeof row[key] === 'string' ? row[key].trim() : row[key];
      });
      return newRow;
    });

    if (!rows.length) return res.status(400).json({ error: 'Uploaded file is empty' });

    for (const row of rows) {
      const customer_name = row.customer_name || row.Customer_Name || row.name || row.customer;
      if (!customer_name) continue;

      const contact_number = row.contact_number || row.mobile || row.phone || null;
      const whatsapp_number = row.whatsapp_number || row.whatsapp || null;
      const address = row.address || null;
      const state = row.state || null;
      const pin_code = row.pin_code || null;
      const gst_number = row.gst_number || row.gst || null;

      const where = {};
      if (gst_number) where.gst_number = gst_number;
      else if (contact_number) where.contact_number = contact_number;
      else where.customer_name = customer_name;

      await Customer.findOrCreate({
        where,
        defaults: {
          customer_name,
          contact_number,
          whatsapp_number,
          address,
          state,
          pin_code,
          gst_number,
          status: 'ACTIVE',
        },
        transaction,
      });
    }

    await transaction.commit();
    res.json({ message: 'Customers bulk uploaded successfully', total_rows: rows.length });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: 'Bulk upload failed', message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    return res.status(201).json(customer);
  } catch (error) {
    console.error(error);
    return res.status(400).json({
      message: 'Failed to create customer',
      error: error.message,
    });
  }
};

exports.getAll = async (req, res) => {
  try {
    const customers = await Customer.findAll({
      where: { status: 'ACTIVE' },
      order: [['createdAt', 'DESC']],
    });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.update = async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    await customer.update(req.body);
    res.json({
      message: 'Customer updated successfully',
      customer,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: 'Failed to update customer',
      error: error.message,
    });
  }
};