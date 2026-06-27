const express = require('express');
const router = express.Router();
const { isAdminAuth, checkPermission } = require('../../middlewares/adminAuth');
const Order = require('../../models/Order');
const OrderService = require('../../services/orderService');

// Get all orders
router.get('/', isAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('seller', 'businessName')
        .populate('deliveryBoy', 'fullName phone')
        .lean(),
      Order.countDocuments(query)
    ]);

    res.json({
      success: true,
      orders,
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

// Get order details
router.get('/:orderId', isAdminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('seller')
      .populate('customer')
      .populate('deliveryBoy')
      .populate('deliveryAssignment');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update order status
router.patch('/:orderId/status', isAdminAuth, checkPermission(['manage_orders']), async (req, res) => {
  try {
    const { status, note } = req.body;

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await order.updateStatus(status, note, req.admin._id, 'ADMIN');

    res.json({
      success: true,
      message: 'Order status updated',
      order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process refund
router.post('/:orderId/refund', isAdminAuth, checkPermission(['manage_refunds']), async (req, res) => {
  try {
    const { refundAmount, reason } = req.body;

    const result = await OrderService.processRefund(
      req.params.orderId,
      refundAmount,
      reason,
      req.admin._id
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Release funds
router.post('/:orderId/release-funds', isAdminAuth, checkPermission(['manage_payments']), async (req, res) => {
  try {
    const result = await OrderService.releaseFunds(req.params.orderId, req.admin._id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;