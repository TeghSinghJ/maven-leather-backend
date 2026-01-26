const express = require('express');
const router = express.Router();
const transportController = require('../controllers/transport.controller');

router.post('/type', transportController.createTransportType);
router.get('/type', transportController.getAllTransportTypes);
router.get('/type/:id', transportController.getTransportTypeById);
router.put('/type/:id', transportController.updateTransportType);
router.delete('/type/:id', transportController.deleteTransportType);

router.post('/', transportController.createTransport);
router.get('/', transportController.getAllTransports);
router.get('/:id', transportController.getTransportById);
router.put('/:id', transportController.updateTransport);
router.delete('/:id', transportController.deleteTransport);
router.get("/type/:id/transports", transportController.getTransportsByTypeId);

module.exports = router;
