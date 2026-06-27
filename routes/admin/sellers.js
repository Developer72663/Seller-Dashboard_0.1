const express = require('express');
const router = express.Router();
const { isAdminAuth, checkPermission } = require('../../middlewares/adminAuth');
const Seller = require('../../models/Seller');
const { sendApprovalEmail } = require('../../services/email');
const AnalyticsService = require('../../services/analyticsService');

// Get all sellers
router.get('/', isAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      Seller.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password -salt')
        .lean(),
      Seller.countDocuments()
    ]);

    res.json({
      success: true,
      sellers,
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

// Get seller details
router.get('/:sellerId', isAdminAuth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.sellerId)
      .select('-password -salt')
      .lean();

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    const analytics = await AnalyticsService.getSellerPerformanceAnalytics(seller._id);

    res.json({
      success: true,
      seller,
      analytics
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve seller
router.post('/:sellerId/approve', isAdminAuth, checkPermission(['manage_sellers']), async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      {
        verificationStatus: 'Approved',
        approvedBy: req.admin._id,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    await sendApprovalEmail(seller.email, seller.fullName, 'approved');

    res.json({
      success: true,
      message: 'Seller approved',
      seller
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reject seller
router.post('/:sellerId/reject', isAdminAuth, checkPermission(['manage_sellers']), async (req, res) => {
  try {
    const { reason } = req.body;

    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      {
        verificationStatus: 'Rejected',
        rejectedAt: new Date(),
        rejectionReason: reason || 'Application rejected by admin'
      },
      { new: true }
    );

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    await sendApprovalEmail(seller.email, seller.fullName, 'rejected');

    res.json({
      success: true,
      message: 'Seller rejected',
      seller
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Suspend seller
router.post('/:sellerId/suspend', isAdminAuth, checkPermission(['manage_sellers']), async (req, res) => {
  try {
    const { reason } = req.body;

    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      {
        status: 'suspended',
        suspensionReason: reason || 'Suspended by admin',
        suspendedAt: new Date(),
        suspendedBy: req.admin._id
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Seller suspended',
      seller
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Activate seller
router.post('/:sellerId/activate', isAdminAuth, checkPermission(['manage_sellers']), async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(
      req.params.sellerId,
      {
        status: 'active',
        suspensionReason: '',
        suspendedAt: null
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Seller activated',
      seller
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;