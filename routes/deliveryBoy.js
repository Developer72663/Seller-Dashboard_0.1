const express = require('express');
const router = express.Router();
const { isDeliveryAuth } = require('../middlewares/deliveryAuth');
const DeliveryBoy = require('../models/DeliveryBoy');
const DeliveryAssignment = require('../models/DeliveryAssignment');
const DeliveryService = require('../services/deliveryService');
const { creatTokenForUser } = require('../services/authentication');
const { createHmac, randomBytes } = require('crypto');

// Delivery boy login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required'
      });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ email: email.toLowerCase() });
    if (!deliveryBoy) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const hashedPassword = createHmac('sha256', deliveryBoy.salt)
      .update(password)
      .digest('hex');

    if (hashedPassword !== deliveryBoy.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = creatTokenForUser(deliveryBoy);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      deliveryBoy: {
        _id: deliveryBoy._id,
        fullName: deliveryBoy.fullName,
        email: deliveryBoy.email,
        phone: deliveryBoy.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get delivery boy profile
router.get('/profile', isDeliveryAuth, async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(req.deliveryBoy._id).select('-password -salt');

    res.json({
      success: true,
      deliveryBoy
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update location
router.post('/location/update', isDeliveryAuth, async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude required'
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(req.deliveryBoy._id);
    await deliveryBoy.updateLocation(latitude, longitude, address);

    res.json({
      success: true,
      message: 'Location updated',
      location: deliveryBoy.currentLocation
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get assigned deliveries
router.get('/assignments', isDeliveryAuth, async (req, res) => {
  try {
    const status = req.query.status || 'assigned';

    const assignments = await DeliveryAssignment.find({
      deliveryBoy: req.deliveryBoy._id,
      status
    })
      .populate('order', 'orderNumber totalAmount')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      assignments,
      count: assignments.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get assignment details
router.get('/assignments/:assignmentId', isDeliveryAuth, async (req, res) => {
  try {
    const assignment = await DeliveryAssignment.findById(req.params.assignmentId)
      .populate('order')
      .populate('deliveryBoy');

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.deliveryBoy._id.toString() !== req.deliveryBoy._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.json({
      success: true,
      assignment
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update assignment status
router.patch('/assignments/:assignmentId/status', isDeliveryAuth, async (req, res) => {
  try {
    const { status, latitude, longitude, address } = req.body;

    const assignment = await DeliveryAssignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.deliveryBoy.toString() !== req.deliveryBoy._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await DeliveryService.updateDeliveryLocation(
      req.params.assignmentId,
      latitude,
      longitude,
      address,
      status
    );

    res.json({
      success: true,
      message: 'Status updated'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark delivery complete
router.post('/assignments/:assignmentId/complete', isDeliveryAuth, async (req, res) => {
  try {
    const { receivedBy, otp, photo } = req.body;

    const assignment = await DeliveryAssignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.deliveryBoy.toString() !== req.deliveryBoy._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const updatedAssignment = await DeliveryService.completeDelivery(
      req.params.assignmentId,
      { receivedBy, otp, photo }
    );

    res.json({
      success: true,
      message: 'Delivery completed',
      assignment: updatedAssignment
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Report delivery issue
router.post('/assignments/:assignmentId/issue', isDeliveryAuth, async (req, res) => {
  try {
    const { reason, description, photo } = req.body;

    const assignment = await DeliveryAssignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    if (assignment.deliveryBoy.toString() !== req.deliveryBoy._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const updatedAssignment = await DeliveryService.reportDeliveryIssue(
      req.params.assignmentId,
      { reason, description, photo }
    );

    res.json({
      success: true,
      message: 'Issue reported',
      assignment: updatedAssignment
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get delivery analytics
router.get('/analytics/summary', isDeliveryAuth, async (req, res) => {
  try {
    const period = req.query.period || 'month';
    const analytics = await DeliveryService.getDeliveryAnalytics(req.deliveryBoy._id, period);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;