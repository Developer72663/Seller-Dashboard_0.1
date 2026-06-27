const express = require('express');
const router = express.Router();
const { isAdminAuth } = require('../../middlewares/adminAuth');
const AnalyticsService = require('../../services/analyticsService');
const Order = require('../../models/Order');
const Seller = require('../../models/Seller');
const DeliveryBoy = require('../../models/DeliveryBoy');

// Admin Dashboard Home
router.get('/', isAdminAuth, async (req, res) => {
  try {
    const analytics = await AnalyticsService.getAdminDashboardAnalytics();
    const monthlyRevenue = await AnalyticsService.getMonthlyRevenueReport(6);
    const topSellers = await AnalyticsService.getSellerRankings(5);
    const deliveryMetrics = await AnalyticsService.getDeliveryPerformanceAnalytics();

    res.json({
      success: true,
      data: {
        analytics,
        monthlyRevenue,
        topSellers,
        deliveryMetrics
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get recent orders
router.get('/recent-orders', isAdminAuth, async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('seller', 'businessName')
      .populate('customer', 'name email')
      .lean();

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get pending verifications
router.get('/pending-sellers', isAdminAuth, async (req, res) => {
  try {
    const sellers = await Seller.find({ verificationStatus: 'Pending' })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      sellers,
      count: sellers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get active delivery boys
router.get('/active-delivery-boys', isAdminAuth, async (req, res) => {
  try {
    const deliveryBoys = await DeliveryBoy.find({ status: 'active' })
      .select('fullName phone currentLocation totalDeliveries averageRating isAvailable')
      .lean();

    res.json({
      success: true,
      deliveryBoys,
      count: deliveryBoys.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;