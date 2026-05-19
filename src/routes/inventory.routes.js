const express = require('express');
const router = express.Router();
const controller = require('../controllers/inventory.controller');

// Middleware - assuming you have auth middleware
const { requireAuth } = require('../middlewares/auth');

// ========== RACK ROUTES ==========
router.post('/racks', requireAuth, controller.createRack);
router.get('/racks', requireAuth, controller.getRacks);

// ========== LEATHER FOLD ROUTES ==========
router.post('/leather-folds', requireAuth, controller.createLeatherFold);
router.get('/leather-folds', requireAuth, controller.getLeatherFolds);
router.get('/leather-folds/barcode/:barcode', requireAuth, controller.getLeatherFoldByBarcode);
router.delete('/leather-folds/:id', requireAuth, controller.deleteLeatherFold);
router.post('/leather-folds/:id/delete', requireAuth, controller.deleteLeatherFold);

// ========== HIDE INVENTORY ROUTES ==========
router.post('/hides', requireAuth, controller.addHides);
router.put('/hides/:hide_id/status', requireAuth, controller.updateHideStatus);
router.get('/hides/available', requireAuth, controller.getAvailableHides);

// ========== SEARCH & FILTER ==========
router.get('/search', requireAuth, controller.searchInventory);

// ========== BARCODE SCANNING ==========
// Rack barcode routes
router.get('/scan/rack/:barcode', requireAuth, controller.scanRackBarcode);
router.put('/racks/:rack_id/barcode', requireAuth, controller.assignRackBarcode);

// Hide barcode routes
router.get('/scan/hide/:barcode', requireAuth, controller.scanHideBarcode);
router.put('/hides/:hide_id/barcode', requireAuth, controller.assignHideBarcode);

module.exports = router;
