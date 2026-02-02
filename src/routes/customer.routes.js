'use strict';

const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const uploadMiddleware = require('../middlewares/upload.middleware');

router.post('/', customerController.create);
router.get('/', customerController.getAll);
router.get('/:id', customerController.getById);
router.post(
  '/bulk-upload',
  uploadMiddleware.single('file'),
  customerController.bulkUpload
);
router.put('/:id', customerController.update);
module.exports = router;
