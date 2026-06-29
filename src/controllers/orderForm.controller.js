'use strict';

const {
  OrderForm,
  OrderFormItem,
  LeatherProduct,
  Customer,
  User,
  ProformaInvoice,
  PIItem,
  sequelize,
} = require('../../models');
const { Op, Transaction } = require('sequelize');
const { COMPANY } = require('../constants/company.constants');
const { suggestBatch } = require('./pi.controller');
const generateOrderFormPdf = require('../utils/orderFormPdf');

const generateOrderNumber = async () => {
  const count = await OrderForm.count();
  return `OF-${String(count + 1).padStart(5, '0')}`;
};

const normalizeBatchEntries = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeBatchEntries(parsed);
    } catch {
      return [];
    }
  }

  if (typeof value === 'object') return [value];
  return [];
};

exports.createOrderFormSnapshotFromPI = async (pi, user, transaction) => {
  if (!pi) return null;

  // Always create a NEW order form for each PI
  // This ensures all articles from all PIs are captured
  const orderNumber = await generateOrderNumber();
  const orderForm = await OrderForm.create(
    {
      order_number: orderNumber,
      company_name: pi.company_name || COMPANY.MARVIN,
      customer_id: pi.customer_id,
      customer_name: pi.customer?.customer_name || pi.customer_name || 'Customer',
      gst_number: pi.customer?.gst_number || null,
      contact_number: pi.customer?.contact_number || null,
      address: pi.customer?.address || null,
      state: pi.customer?.state || null,
      pin_code: pi.customer?.pin_code || null,
      order_date: pi.createdAt ? pi.createdAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      order_time: pi.createdAt ? pi.createdAt.toTimeString().slice(0, 5) : null,
      requested_delivery_date: null,
      delivery_time: null,
      notes: `Auto-generated from PI ${pi.id}${pi.revision_no ? ` (Revision ${pi.revision_no})` : ''}`,
      status: 'DRAFT',
      created_by: user?.id || pi.created_by,
    },
    { transaction },
  );

  // Add ALL items from the PI
  const items = Array.isArray(pi.items) ? pi.items : [];
  console.log(`📋 Creating order form ${orderForm.order_number} for PI ${pi.id} with ${items.length} items`);
  
  for (const item of items) {
    const batchInfo = normalizeBatchEntries(item.batch_info);
    await OrderFormItem.create(
      {
        order_form_id: orderForm.id,
        product_id: item.product_id || null,
        description: item.product?.leather_code || item.product?.color || item.description || null,
        qty: Number(item.qty) || 0,
        rate: item.rate == null ? null : Number(item.rate),
        batch_info: batchInfo,
        suggested_batches: batchInfo,
        remarks: `PI ${pi.id}`,
      },
      { transaction },
    );
  }

  console.log(`✓ Order form ${orderForm.order_number} created with ${items.length} items`);
  return orderForm;
};

exports.createOrderForm = async (req, res) => {
  const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });

  try {
    const {
      company_name = COMPANY.MARVIN,
      customer_id,
      customer_name,
      gst_number,
      contact_number,
      address,
      state,
      pin_code,
      order_date,
      order_time,
      requested_delivery_date,
      delivery_time,
      notes,
      status = 'DRAFT',
      items,
    } = req.body;

    if (!customer_name || !order_date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'order_date, customer_name and items are required' });
    }

    const order_number = await generateOrderNumber();

    const orderForm = await OrderForm.create(
      {
        order_number,
        company_name,
        customer_id,
        customer_name,
        gst_number,
        contact_number,
        address,
        state,
        pin_code,
        order_date,
        order_time,
        requested_delivery_date,
        delivery_time,
        notes,
        status,
        created_by: req.user?.id,
      },
      { transaction: t },
    );

    const createdItems = [];
    for (const item of items) {
      const newItem = await OrderFormItem.create(
        {
          order_form_id: orderForm.id,
          product_id: item.product_id || null,
          description: item.description || item.product_name || null,
          qty: Number(item.qty) || 0,
          rate: item.rate == null ? null : Number(item.rate),
          batch_info: item.batch_info || null,
          suggested_batches: item.suggested_batches || null,
          remarks: item.remarks || null,
        },
        { transaction: t },
      );

      createdItems.push(newItem);
    }

    await t.commit();

    const orderData = orderForm.toJSON();
    orderData.items = createdItems;
    return res.status(201).json(orderData);
  } catch (err) {
    await t.rollback();
    console.error('createOrderForm error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.updateOrderForm = async (req, res) => {
  const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });

  try {
    const orderForm = await OrderForm.findByPk(req.params.id, { transaction: t });
    if (!orderForm) return res.status(404).json({ error: 'Order form not found' });

    const updateData = { ...req.body };
    delete updateData.items;

    await orderForm.update(updateData, { transaction: t });

    if (Array.isArray(req.body.items)) {
      await OrderFormItem.destroy({ where: { order_form_id: orderForm.id }, transaction: t });
      for (const item of req.body.items) {
        await OrderFormItem.create(
          {
            order_form_id: orderForm.id,
            product_id: item.product_id || null,
            description: item.description || item.product_name || null,
            qty: Number(item.qty) || 0,
            rate: item.rate == null ? null : Number(item.rate),
            batch_info: item.batch_info || null,
            suggested_batches: item.suggested_batches || null,
            remarks: item.remarks || null,
          },
          { transaction: t },
        );
      }
    }

    await t.commit();
    return res.json({ message: 'Order form updated successfully' });
  } catch (err) {
    await t.rollback();
    console.error('updateOrderForm error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getOrderForms = async (req, res) => {
  try {
    const orderForms = await OrderForm.findAll({
      include: [
        { model: OrderFormItem, as: 'items' },
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return res.json(orderForms);
  } catch (err) {
    console.error('getOrderForms error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getOrderFormById = async (req, res) => {
  try {
    const orderForm = await OrderForm.findByPk(req.params.id, {
      include: [
        { model: OrderFormItem, as: 'items', include: [{ model: LeatherProduct, as: 'product' }] },
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!orderForm) return res.status(404).json({ error: 'Order form not found' });
    return res.json(orderForm);
  } catch (err) {
    console.error('getOrderFormById error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteOrderForm = async (req, res) => {
  try {
    const deleted = await OrderForm.destroy({ where: { id: req.params.id } });
    if (!deleted) return res.status(404).json({ error: 'Order form not found' });
    return res.status(204).send();
  } catch (err) {
    console.error('deleteOrderForm error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.createOrderFormFromPI = async (req, res) => {
  const t = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });

  try {
    const pi = await ProformaInvoice.findByPk(req.params.piId, {
      transaction: t,
      include: [
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: PIItem, as: 'items', include: [{ model: LeatherProduct, as: 'product' }] },
      ],
    });

    if (!pi) {
      await t.rollback();
      return res.status(404).json({ error: 'PI not found' });
    }

    const orderForm = await exports.createOrderFormSnapshotFromPI(pi, req.user, t);
    await t.commit();

    return res.status(201).json({ id: orderForm.id, order_form: orderForm });
  } catch (err) {
    await t.rollback();
    console.error('createOrderFormFromPI error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.suggestOrderFormBatches = async (req, res) => {
  try {
    const { items, collection_id } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    req.body.items = items.map((item) => ({
      product_id: item.product_id,
      requested_qty: item.qty,
    }));
    req.body.collection_id = collection_id;

    return await suggestBatch(req, res);
  } catch (err) {
    console.error('suggestOrderFormBatches error:', err);
    return res.status(500).json({ error: err.message });
  }
};

exports.downloadOrderForm = async (req, res) => {
  try {
    const orderForm = await OrderForm.findByPk(req.params.id, {
      include: [
        { model: OrderFormItem, as: 'items', include: [{ model: LeatherProduct, as: 'product' }] },
        { model: Customer, as: 'customer' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!orderForm) return res.status(404).json({ error: 'Order form not found' });

    return generateOrderFormPdf(res, orderForm.toJSON());
  } catch (err) {
    console.error('downloadOrderForm error:', err);
    return res.status(500).json({ error: err.message });
  }
};
