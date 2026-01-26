const { TransportType, Transport } = require('../../models');

exports.createTransportType = async (req, res) => {
  try {
    const { name, parent_id, base_price, status } = req.body;
    const type = await TransportType.create({ name, parent_id, base_price, status });
    return res.status(201).json({ message: 'Transport type created', data: type });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getAllTransportTypes = async (req, res) => {
  try {
    const types = await TransportType.findAll({
      include: { model: TransportType, as: 'subTypes' },
      order: [['id', 'ASC']],
    });
    return res.status(200).json({ data: types });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getTransportTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await TransportType.findByPk(id, { include: { model: TransportType, as: 'subTypes' } });
    if (!type) return res.status(404).json({ message: 'Transport type not found' });
    return res.status(200).json({ data: type });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Update TransportType
exports.updateTransportType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, base_price, status } = req.body;
    const type = await TransportType.findByPk(id);
    if (!type) return res.status(404).json({ message: 'Transport type not found' });

    await type.update({ name, parent_id, base_price, status });
    return res.status(200).json({ message: 'Transport type updated', data: type });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete TransportType
exports.deleteTransportType = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await TransportType.findByPk(id);
    if (!type) return res.status(404).json({ message: 'Transport type not found' });

    await type.destroy();
    return res.status(200).json({ message: 'Transport type deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ================= Transport CRUD =================

// Create Transport
exports.createTransport = async (req, res) => {
  try {
    const { name, transport_type_id, status } = req.body;

    const type = await TransportType.findByPk(transport_type_id);
    if (!type) return res.status(400).json({ message: 'Invalid transport_type_id' });

    const transport = await Transport.create({ name, transport_type_id, status });
    return res.status(201).json({ message: 'Transport created', data: transport });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all Transports (with type & base_price)
exports.getAllTransports = async (req, res) => {
  try {
    const transports = await Transport.findAll({
      include: { model: TransportType, as: 'type' },
      order: [['id', 'ASC']],
    });
    return res.status(200).json({ data: transports });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get single Transport by ID
exports.getTransportById = async (req, res) => {
  try {
    const { id } = req.params;
    const transport = await Transport.findByPk(id, { include: { model: TransportType, as: 'type' } });
    if (!transport) return res.status(404).json({ message: 'Transport not found' });
    return res.status(200).json({ data: transport });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Update Transport
exports.updateTransport = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, transport_type_id, status } = req.body;

    const transport = await Transport.findByPk(id);
    if (!transport) return res.status(404).json({ message: 'Transport not found' });

    if (transport_type_id) {
      const type = await TransportType.findByPk(transport_type_id);
      if (!type) return res.status(400).json({ message: 'Invalid transport_type_id' });
    }

    await transport.update({ name, transport_type_id, status });
    return res.status(200).json({ message: 'Transport updated', data: transport });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete Transport
exports.deleteTransport = async (req, res) => {
  try {
    const { id } = req.params;
    const transport = await Transport.findByPk(id);
    if (!transport) return res.status(404).json({ message: 'Transport not found' });

    await transport.destroy();
    return res.status(200).json({ message: 'Transport deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
exports.getTransportsByTypeId = async (req, res) => {
  try {
    const { id } = req.params; 

    const transports = await Transport.findAll({
      where: { transport_type_id: id },
      attributes: ["id", "name", "status"], 
      include: {
        model: TransportType,
        as: "type",
        attributes: ["base_price"], 
      },
      order: [["id", "ASC"]],
    });

    const formatted = transports.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      base_price: t.type.base_price
    }));

    return res.status(200).json({ data: formatted });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
