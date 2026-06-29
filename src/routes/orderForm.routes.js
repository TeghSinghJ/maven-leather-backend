'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/orderForm.controller');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

router.post('/', requireAuth, controller.createOrderForm);
router.post('/from-pi/:piId', requireAuth, controller.createOrderFormFromPI);
router.put('/:id', requireAuth, controller.updateOrderForm);
router.get('/', requireAuth, controller.getOrderForms);
router.get('/:id', requireAuth, controller.getOrderFormById);
router.delete('/:id', requireAuth, requireAdmin, controller.deleteOrderForm);
router.post('/suggest-batches', requireAuth, controller.suggestOrderFormBatches);
router.get('/:id/download', requireAuth, controller.downloadOrderForm);

module.exports = router;
