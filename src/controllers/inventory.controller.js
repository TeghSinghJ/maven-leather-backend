const { Rack, LeatherFold, HideInventory, Batch, LeatherHideStock } = require('../../models');
const { Op } = require('sequelize');

// Generate unique barcode
const generateBarcode = async () => {
  const lastLeather = await LeatherFold.findOne({
    order: [['id', 'DESC']],
  });
  const nextNumber = (lastLeather?.id || 0) + 1;
  return `LTH-${String(nextNumber).padStart(5, '0')}`;
};

// =====================
// RACK MANAGEMENT
// =====================

exports.createRack = async (req, res) => {
  try {
    const { name, location, capacity } = req.body;

    if (!name) return res.status(400).json({ error: 'Rack name is required' });

    const rack = await Rack.create({
      name,
      location,
      capacity: capacity || 0,
      status: 'ACTIVE',
    });

    res.status(201).json({
      message: 'Rack created successfully',
      rack,
    });
  } catch (err) {
    console.error('Create rack error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getRacks = async (req, res) => {
  try {
    const { status } = req.query;

    const where = {};
    if (status) where.status = status;

    const racks = await Rack.findAll({
      where,
      include: [
        {
          model: LeatherFold,
          as: 'leatherFolds',
          attributes: ['id', 'barcode', 'article', 'color', 'total_hides', 'total_sqft'],
        },
      ],
      order: [['name', 'ASC']],
    });

    res.json(racks);
  } catch (err) {
    console.error('Get racks error:', err);
    res.status(500).json({ error: err.message });
  }
};

// =====================
// LEATHER FOLD MANAGEMENT
// =====================

exports.createLeatherFold = async (req, res) => {
  try {
    const { article, color, batch, rack_id, location, notes, batch_id } = req.body;

    if (!article || !color || !batch || !rack_id) {
      return res.status(400).json({
        error: 'article, color, batch, and rack_id are required',
      });
    }

    // Verify rack exists
    const rack = await Rack.findByPk(rack_id);
    if (!rack) return res.status(404).json({ error: 'Rack not found' });

    // If batch_id provided, verify batch exists and get hides
    let batchHides = [];
    if (batch_id) {
      const batchData = await Batch.findByPk(batch_id, {
        include: [{ model: LeatherHideStock, as: 'hides' }],
      });
      if (!batchData) return res.status(404).json({ error: 'Batch not found' });
      batchHides = batchData.hides || [];
    }

    // Generate barcode
    const barcode = await generateBarcode();

    const leatherFold = await LeatherFold.create({
      barcode,
      article,
      color,
      batch,
      rack_id,
      location: location || 'Bangalore',
      notes,
      status: 'ACTIVE',
    });

    // Create hides from batch if provided
    let createdHides = [];
    if (batchHides.length > 0) {
      createdHides = await Promise.all(
        batchHides.map((hide, index) =>
          HideInventory.create({
            fold_id: leatherFold.id,
            hide_number: index + 1,
            size_sqft: hide.qty,
            quality_grade: hide.grade || 'A',
            status: 'ACTIVE',
          })
        )
      );
    }

    res.status(201).json({
      message: 'Leather fold created successfully',
      leatherFold,
      hides: createdHides,
    });
  } catch (err) {
    console.error('Create leather fold error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getLeatherFolds = async (req, res) => {
  try {
    const { article, color, batch, status, rack_id } = req.query;

    const where = {};
    if (article) where.article = { [Op.like]: `%${article}%` };
    if (color) where.color = { [Op.like]: `%${color}%` };
    if (batch) where.batch = { [Op.like]: `%${batch}%` };
    if (status) where.status = status;
    if (rack_id) where.rack_id = rack_id;

    const leatherFolds = await LeatherFold.findAll({
      where,
      include: [
        {
          model: Rack,
          as: 'rack',
          attributes: ['id', 'name', 'location'],
        },
        {
          model: HideInventory,
          as: 'hides',
          attributes: ['id', 'hide_number', 'size_sqft', 'quality_grade', 'status'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(leatherFolds);
  } catch (err) {
    console.error('Get leather folds error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getLeatherFoldByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });

    const leatherFold = await LeatherFold.findOne({
      where: { barcode },
      include: [
        {
          model: Rack,
          as: 'rack',
          attributes: ['id', 'name', 'location'],
        },
        {
          model: HideInventory,
          as: 'hides',
          attributes: ['id', 'leather_fold_id', 'hide_number', 'barcode', 'size_sqft', 'quality_grade', 'status', 'sold_at', 'sold_to', 'remarks'],
        },
      ],
    });

    if (!leatherFold) {
      return res.status(404).json({ error: 'Leather fold not found' });
    }

    res.json(leatherFold);
  } catch (err) {
    console.error('Get leather fold by barcode error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteLeatherFold = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Fold ID is required' });

    const leatherFold = await LeatherFold.findByPk(id);
    if (!leatherFold) return res.status(404).json({ error: 'Leather fold not found' });

    await LeatherFold.destroy({ where: { id } });

    res.json({ message: 'Leather fold deleted successfully' });
  } catch (err) {
    console.error('Delete leather fold error:', err);
    res.status(500).json({ error: err.message });
  }
};

// =====================
// HIDE INVENTORY MANAGEMENT
// =====================

exports.addHides = async (req, res) => {
  try {
    const { leather_fold_id, hides } = req.body;

    if (!leather_fold_id || !Array.isArray(hides) || hides.length === 0) {
      return res.status(400).json({
        error: 'leather_fold_id and hides array are required',
      });
    }

    const leatherFold = await LeatherFold.findByPk(leather_fold_id);
    if (!leatherFold) return res.status(404).json({ error: 'Leather fold not found' });

    // Create hide records
    const createdHides = [];
    let totalSqft = 0;

    for (let i = 0; i < hides.length; i++) {
      const hide = hides[i];
      const hideRecord = await HideInventory.create({
        leather_fold_id,
        hide_number: i + 1,
        size_sqft: hide.size_sqft,
        quality_grade: hide.quality_grade || 'A',
        status: 'AVAILABLE',
        remarks: hide.remarks,
      });
      createdHides.push(hideRecord);
      totalSqft += hide.size_sqft;
    }

    // Update leather fold total
    await leatherFold.update({
      total_hides: hides.length,
      total_sqft: parseFloat(totalSqft.toFixed(2)),
    });

    res.status(201).json({
      message: `${hides.length} hides added successfully`,
      leatherFold,
      hides: createdHides,
    });
  } catch (err) {
    console.error('Add hides error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateHideStatus = async (req, res) => {
  try {
    const { hide_id } = req.params;
    const { status, sold_to, remarks } = req.body;

    if (!hide_id || !status) {
      return res.status(400).json({ error: 'hide_id and status are required' });
    }

    const hide = await HideInventory.findByPk(hide_id);
    if (!hide) return res.status(404).json({ error: 'Hide not found' });

    await hide.update({
      status,
      sold_to,
      remarks,
      sold_at: status === 'SOLD' ? new Date() : null,
    });

    res.json({
      message: 'Hide status updated successfully',
      hide,
    });
  } catch (err) {
    console.error('Update hide status error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getAvailableHides = async (req, res) => {
  try {
    const { article, color, min_sqft, max_sqft } = req.query;

    const where = {
      status: 'AVAILABLE',
    };

    if (min_sqft) where.size_sqft = { [Op.gte]: parseFloat(min_sqft) };
    if (max_sqft) {
      where.size_sqft = where.size_sqft
        ? { ...where.size_sqft, [Op.lte]: parseFloat(max_sqft) }
        : { [Op.lte]: parseFloat(max_sqft) };
    }

    const hides = await HideInventory.findAll({
      where,
      include: [
        {
          model: LeatherFold,
          as: 'leatherFold',
          where: {
            status: 'ACTIVE',
            ...(article && { article: { [Op.like]: `%${article}%` } }),
            ...(color && { color: { [Op.like]: `%${color}%` } }),
          },
          include: [
            {
              model: Rack,
              as: 'rack',
              attributes: ['name', 'location'],
            },
          ],
        },
      ],
      order: [['size_sqft', 'DESC']],
    });

    res.json(hides);
  } catch (err) {
    console.error('Get available hides error:', err);
    res.status(500).json({ error: err.message });
  }
};

// =====================
// SEARCH & FILTER
// =====================

exports.searchInventory = async (req, res) => {
  try {
    const { search_term, article, color, batch, min_sqft, max_sqft, status, rack_id } = req.query;

    const leatherWhere = {
      status: status || 'ACTIVE',
    };

    // Add rack filtering if rack_id is provided
    if (rack_id) {
      leatherWhere.rack_id = rack_id;
    }

    if (search_term) {
      leatherWhere[Op.or] = [
        { barcode: { [Op.like]: `%${search_term}%` } },
        { article: { [Op.like]: `%${search_term}%` } },
        { color: { [Op.like]: `%${color}%` } },
        { batch: { [Op.like]: `%${batch}%` } },
      ];
    } else {
      if (article) leatherWhere.article = { [Op.like]: `%${article}%` };
      if (color) leatherWhere.color = { [Op.like]: `%${color}%` };
      if (batch) leatherWhere.batch = { [Op.like]: `%${batch}%` };
    }

    const results = await LeatherFold.findAll({
      where: leatherWhere,
      include: [
        {
          model: Rack,
          as: 'rack',
        },
        {
          model: HideInventory,
          as: 'hides',
          attributes: ['id', 'leather_fold_id', 'hide_number', 'barcode', 'size_sqft', 'quality_grade', 'status', 'sold_at', 'sold_to', 'remarks', 'createdAt', 'updatedAt'],
          where: {
            ...(min_sqft && { size_sqft: { [Op.gte]: parseFloat(min_sqft) } }),
            ...(max_sqft && { size_sqft: { [Op.lte]: parseFloat(max_sqft) } }),
          },
          required: min_sqft || max_sqft ? true : false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json(results);
  } catch (err) {
    console.error('Search inventory error:', err);
    res.status(500).json({ error: err.message });
  }
};

// =====================
// RACK BARCODE SCANNING
// =====================

// Generate rack barcode
exports.generateRackBarcode = async () => {
  const lastRack = await Rack.findOne({
    order: [['id', 'DESC']],
  });
  const nextNumber = (lastRack?.id || 0) + 1;
  return `RCK-${String(nextNumber).padStart(5, '0')}`;
};

// Scan rack barcode and get all articles + hides in that rack
exports.scanRackBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    const rack = await Rack.findOne({
      where: { barcode },
      include: [
        {
          model: LeatherFold,
          as: 'leatherFolds',
          attributes: ['id', 'article', 'color', 'batch', 'total_hides', 'total_sqft', 'notes'],
          include: [
            {
              model: HideInventory,
              as: 'hides',
              attributes: ['id', 'hide_number', 'barcode', 'size_sqft', 'quality_grade', 'status', 'sold_to', 'remarks'],
              order: [['hide_number', 'ASC']],
            },
          ],
        },
      ],
    });

    if (!rack) {
      return res.status(404).json({ error: 'Rack not found' });
    }

    res.json({
      rack,
      totalArticles: rack.leatherFolds?.length || 0,
      totalHides: rack.leatherFolds?.reduce((sum, fold) => sum + (fold.hides?.length || 0), 0) || 0,
    });
  } catch (err) {
    console.error('Scan rack barcode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// =====================
// HIDE BARCODE SCANNING
// =====================

// Generate hide barcode
exports.generateHideBarcode = async (hideId) => {
  return `HID-${String(hideId).padStart(8, '0')}`;
};

// Scan hide barcode and get hide details
exports.scanHideBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    const hide = await HideInventory.findOne({
      where: { barcode },
      include: [
        {
          model: LeatherFold,
          as: 'leatherFold',
          attributes: ['id', 'barcode', 'article', 'color', 'batch', 'total_hides', 'total_sqft'],
          include: [
            {
              model: Rack,
              as: 'rack',
              attributes: ['id', 'name', 'location', 'barcode'],
            },
          ],
        },
      ],
    });

    if (!hide) {
      return res.status(404).json({ error: 'Hide not found' });
    }

    res.json(hide);
  } catch (err) {
    console.error('Scan hide barcode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Assign barcode to hide
exports.assignHideBarcode = async (req, res) => {
  try {
    const { hide_id } = req.params;
    const { barcode } = req.body;

    const hide = await HideInventory.findByPk(hide_id);
    if (!hide) {
      return res.status(404).json({ error: 'Hide not found' });
    }

    hide.barcode = barcode;
    await hide.save();

    res.json({
      message: 'Hide barcode assigned successfully',
      hide,
    });
  } catch (err) {
    console.error('Assign hide barcode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Assign barcode to rack
exports.assignRackBarcode = async (req, res) => {
  try {
    const { rack_id } = req.params;
    const { barcode } = req.body;

    const rack = await Rack.findByPk(rack_id);
    if (!rack) {
      return res.status(404).json({ error: 'Rack not found' });
    }

    rack.barcode = barcode;
    await rack.save();

    res.json({
      message: 'Rack barcode assigned successfully',
      rack,
    });
  } catch (err) {
    console.error('Assign rack barcode error:', err);
    res.status(500).json({ error: err.message });
  }
};
