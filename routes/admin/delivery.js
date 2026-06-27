const express = require('express');
const router = express.Router();
const { isAdminAuth, checkPermission } = require('../../middlewares/adminAuth');
const DeliveryBoy = require('../../models/DeliveryBoy');
const DeliveryAssignment = require('../../models/DeliveryAssignment');
const DeliveryService = require('../../services/deliveryService');

// Get all delivery boys
router.get('/boys', isAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const [deliveryBoys, total] = await Promise.all([
      DeliveryBoy.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password -salt')
        .lean(),
      DeliveryBoy.countDocuments(query)
    ]);

    res.json({
      success: true,
      deliveryBoys,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get delivery boy details
router.get('/boys/:deliveryBoyId', isAdminAuth, async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(req.params.deliveryBoyId).select('-password -salt');

    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: 'Delivery boy not found' });
    }

    const analytics = await DeliveryService.getDeliveryAnalytics(deliveryBoy._id);

    res.json({
      success: true,
      deliveryBoy,
      analytics
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify delivery boy
router.post('/boys/:deliveryBoyId/verify', isAdminAuth, checkPermission(['manage_delivery_boys']), async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      req.params.deliveryBoyId,
      {
        status: 'verified',
        verifiedAt: new Date(),
        verifiedBy: req.admin._id
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Delivery boy verified',
      deliveryBoy
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all assignments
router.get('/assignments', isAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const [assignments, total] = await Promise.all([
      DeliveryAssignment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('deliveryBoy', 'fullName phone')
        .populate('order', 'orderNumber status')
        .lean(),
      DeliveryAssignment.countDocuments(query)
    ]);

    res.json({
      success: true,
      assignments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;