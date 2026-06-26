const express = require('express');
const router = express.Router();
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');

// Middleware to check admin role
const restrictToAdmin = (req, res, next) => {
  if (!req.seller || req.seller.role !== 'ADMIN') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'Access Denied: Admins Only'
    });
  }
  next();
};

// Helper: Time ago formatter
const formatTimeAgo = (date) => {
  if (!date) return 'N/A';
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// ====================== GET ADMIN DASHBOARD ======================
router.get('/', restrictToAdmin, async (req, res) => {
  try {
    const pendingSellers = await Seller.find({
      verificationStatus: 'Pending',
      isGoogleUser: false
    }).sort({ createdAt: -1 }).lean();

    const approvedEmailSellers = await Seller.find({
      verificationStatus: 'Approved',
      isGoogleUser: false
    }).sort({ approvedAt: -1 }).lean();

    const googleSellers = await Seller.find({
      isGoogleUser: true
    }).sort({ createdAt: -1 }).lean();

    const rejectedSellers = await Seller.find({
      verificationStatus: 'Rejected',
      isGoogleUser: false
    }).sort({ rejectedAt: -1 }).lean();

    const stats = {
      total: await Seller.countDocuments(),
      pending: await Seller.countDocuments({ verificationStatus: 'Pending', isGoogleUser: false }),
      approved: await Seller.countDocuments({ verificationStatus: 'Approved', isGoogleUser: false }),
      google: await Seller.countDocuments({ isGoogleUser: true }),
      rejected: await Seller.countDocuments({ verificationStatus: 'Rejected', isGoogleUser: false })
    };

    let Product, OrderModel;
    try { Product = require('../models/Product'); } catch (e) { Product = null; }
    try { OrderModel = require('../models/Order'); } catch (e) { OrderModel = null; }

    let recentOrders = [];
    let topProducts = [];
    let totalRevenue = 0;
    let totalOrdersCount = 0;

    if (OrderModel) {
      recentOrders = await OrderModel.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('seller', 'businessName')
        .lean();

      totalOrdersCount = await OrderModel.countDocuments();

      const revenueAgg = await OrderModel.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]);
      totalRevenue = revenueAgg[0]?.total || 0;
    }

    if (Product) {
      topProducts = await Product.find()
        .sort({ totalRevenue: -1 })
        .limit(10)
        .lean();
    }

    // Get pending payout count
    const pendingPayoutCount = await Wallet.countDocuments({
      'transactions': {
        $elemMatch: {
          type: 'payout_request',
          status: 'pending'
        }
      }
    });

    res.render('adminDashboard', {
      title: 'Admin Dashboard - SellerHub',
      user: req.seller,
      admin: req.seller,
      pendingSellers,
      approvedEmailSellers,
      googleSellers,
      rejectedSellers,
      stats,
      recentOrders,
      topProducts,
      totalRevenue,
      totalOrdersCount,
      pendingPayoutCount,
      formatTimeAgo
    });
  } catch (error) {
    console.error("❌ Admin Dashboard Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Internal Server Error'
    });
  }
});

// ====================== GET ALL SELLERS PAGE ======================
router.get('/sellers', restrictToAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || 'all';

    let query = {};
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } }
      ];
    }
    if (status !== 'all') {
      if (status === 'google') {
        query.isGoogleUser = true;
      } else {
        query.verificationStatus = status.charAt(0).toUpperCase() + status.slice(1);
        query.isGoogleUser = false;
      }
    }

    const totalSellers = await Seller.countDocuments(query);
    const totalPages = Math.ceil(totalSellers / limit);

    const sellers = await Seller.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.render('adminSellers', {
      title: 'All Sellers - Admin',
      user: req.seller,
      admin: req.seller,
      sellers,
      currentPage: page,
      totalPages,
      totalSellers,
      search,
      status,
      hasNext: page < totalPages,
      hasPrev: page > 1
    });
  } catch (error) {
    console.error("❌ Sellers Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Internal Server Error'
    });
  }
});

// ====================== APPROVE SELLER ======================
router.post('/sellers/:id/approve', restrictToAdmin, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    seller.verificationStatus = 'Approved';
    seller.approvedBy = req.seller._id;
    seller.approvedAt = new Date();
    await seller.save();

    // Create wallet for approved seller if not exists
    await Wallet.getOrCreate(seller._id);

    res.json({
      success: true,
      message: "Seller approved successfully",
      seller: {
        id: seller._id,
        fullName: seller.fullName,
        email: seller.email,
        verificationStatus: seller.verificationStatus
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== REJECT SELLER ======================
router.post('/sellers/:id/reject', restrictToAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    seller.verificationStatus = 'Rejected';
    seller.rejectionReason = reason || 'Application rejected by admin';
    seller.rejectedAt = new Date();
    await seller.save();

    res.json({
      success: true,
      message: "Seller rejected",
      seller: {
        id: seller._id,
        fullName: seller.fullName,
        email: seller.email,
        verificationStatus: seller.verificationStatus,
        rejectionReason: seller.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== GET SINGLE SELLER DETAILS ======================
router.get('/sellers/:id', restrictToAdmin, async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id).lean();
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    // Get seller wallet
    const wallet = await Wallet.findOne({ seller: seller._id }).lean();

    // Get seller orders count
    const orderCount = await Order.countDocuments({ seller: seller._id });

    res.json({ 
      success: true, 
      seller,
      wallet: wallet || null,
      orderCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== GET ADMIN ORDERS PAGE ======================
router.get('/orders', restrictToAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || '';
    const sort = req.query.sort || 'newest';
    const search = req.query.search || '';

    let query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    if (sort === 'amount-high') sortOption = { totalAmount: -1 };
    if (sort === 'amount-low') sortOption = { totalAmount: 1 };

    const [orders, totalOrders] = await Promise.all([
      Order.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .populate('seller', 'businessName email')
        .lean(),
      Order.countDocuments(query)
    ]);

    const statAgg = await Order.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        processing: { $sum: { $cond: [{ $in: ['$status', ['confirmed', 'processing', 'shipped']] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        totalRevenue: { $sum: '$totalAmount' }
      }}
    ]);

    let stats = statAgg && statAgg[0] ? statAgg[0] : {};
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('adminOrders', {
      title: 'Orders - Admin',
      user: req.seller,
      admin: req.seller,
      orders,
      stats,
      currentPage: page,
      totalPages,
      totalOrders,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      currentStatus: status,
      currentSort: sort,
      searchQuery: search
    });
  } catch (error) {
    console.error("❌ Orders Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load orders'
    });
  }
});

// ====================== GET SINGLE ORDER DETAILS (ADMIN FULL VIEW) ======================
router.get('/orders/:id', restrictToAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('seller', 'businessName email phoneNumber')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== REJECT ORDER (ADMIN) ======================
router.post('/orders/:id/reject', restrictToAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = reason || 'Rejected by admin';
    order.adminAction.rejectedAt = new Date();
    order.adminAction.rejectedBy = req.seller._id;
    order.adminAction.rejectionReason = reason || 'Rejected by admin';
    order.statusHistory.push({
      status: 'cancelled',
      note: reason || 'Order rejected by admin',
      updatedBy: req.seller._id,
      updatedByRole: 'ADMIN'
    });

    await order.save();

    // Process refund if payment was made
    if (order.paymentStatus === 'paid') {
      order.paymentStatus = 'refunded';
      order.paymentDetails.refundedAt = new Date();
      order.paymentDetails.refundAmount = order.totalAmount;
      order.paymentDetails.refundReason = reason || 'Order rejected by admin';
      await order.save();
    }

    res.json({ success: true, message: 'Order rejected and refunded if paid', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== REFUND ORDER (ADMIN) ======================
router.post('/orders/:id/refund', restrictToAdmin, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ success: false, message: 'Order is not paid' });
    }

    const refundAmount = amount || order.totalAmount;

    order.paymentStatus = 'refunded';
    order.paymentDetails.refundedAt = new Date();
    order.paymentDetails.refundAmount = refundAmount;
    order.paymentDetails.refundReason = reason || 'Admin refund';
    order.adminAction.refundedAt = new Date();
    order.adminAction.refundedBy = req.seller._id;
    order.adminAction.refundReason = reason || 'Admin refund';
    order.status = 'refunded';
    order.statusHistory.push({
      status: 'refunded',
      note: `Refunded Rs.${refundAmount}. Reason: ${reason || 'Admin refund'}`,
      updatedBy: req.seller._id,
      updatedByRole: 'ADMIN'
    });

    await order.save();

    // Deduct from seller wallet if funds were already released
    if (order.fundsReleased) {
      const wallet = await Wallet.getOrCreate(order.seller);
      await wallet.addTransaction('refund', order.sellerEarnings, `Refund for order ${order.orderNumber}`, { order: order._id });
    }

    res.json({ success: true, message: 'Order refunded successfully', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== UPDATE ORDER STATUS (ADMIN) ======================
router.post('/orders/:id/status', restrictToAdmin, async (req, res) => {
  try {
    const { status, note } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.status = status;
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status,
      note: note || `Status changed to ${status} by admin`,
      updatedBy: req.seller._id,
      updatedByRole: 'ADMIN',
      updatedAt: new Date()
    });

    if (status === 'delivered') {
      order.deliveredAt = new Date();
    }

    await order.save();
    res.json({ success: true, message: 'Status updated', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== GET ADMIN PRODUCTS PAGE ======================
router.get('/products', restrictToAdmin, async (req, res) => {
  try {
    let Product;
    try { Product = require('../models/Product'); } catch (e) { Product = null; }

    const page = parseInt(req.query.page) || 1;
    const limit = 24;
    const skip = (page - 1) * limit;
    const status = req.query.status || '';
    const category = req.query.category || '';
    const sort = req.query.sort || 'newest';
    const search = req.query.search || '';
    const viewMode = req.query.view || 'grid';

    let products = [];
    let totalProducts = 0;
    let categories = [];

    if (Product) {
      let query = {};
      if (status) query.status = status;
      if (category) query.category = category;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } }
        ];
      }

      let sortOption = { createdAt: -1 };
      if (sort === 'popular') sortOption = { totalSales: -1 };
      if (sort === 'price-high') sortOption = { sellingPrice: -1 };
      if (sort === 'price-low') sortOption = { sellingPrice: 1 };
      if (sort === 'revenue') sortOption = { totalRevenue: -1 };

      [products, totalProducts, categories] = await Promise.all([
        Product.find(query).sort(sortOption).skip(skip).limit(limit).lean(),
        Product.countDocuments(query),
        Product.distinct('category', { status: 'active' })
      ]);
    }

    const totalPages = Math.ceil(totalProducts / limit);

    res.render('adminProducts', {
      title: 'Products - Admin',
      user: req.seller,
      admin: req.seller,
      products,
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      limit,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      currentStatus: status,
      currentCategory: category,
      currentSort: sort,
      searchQuery: search,
      viewMode
    });
  } catch (error) {
    console.error("❌ Products Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load products'
    });
  }
});

// ====================== TOGGLE PRODUCT STATUS (ADMIN) ======================
router.post('/products/:id/toggle-status', restrictToAdmin, async (req, res) => {
  try {
    let Product;
    try { Product = require('../models/Product'); } catch (e) {
      return res.status(500).json({ success: false, message: 'Product module not available' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    product.status = product.status === 'active' ? 'inactive' : 'active';
    await product.save();

    res.json({
      success: true,
      message: `Product ${product.status === 'active' ? 'activated' : 'deactivated'}`,
      status: product.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== DELETE PRODUCT (ADMIN) ======================
router.post('/products/:id/delete', restrictToAdmin, async (req, res) => {
  try {
    let Product;
    try { Product = require('../models/Product'); } catch (e) {
      return res.status(500).json({ success: false, message: 'Product module not available' });
    }

    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.seller) {
      await Seller.findByIdAndUpdate(product.seller, { $inc: { totalProducts: -1 } });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== GET ADMIN PAYMENTS/PAYOUTS PAGE ======================
router.get('/payments', restrictToAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || 'pending';
    const search = req.query.search || '';

    // Find all wallets with pending/approved payout transactions
    const wallets = await Wallet.find({
      'transactions.type': { $in: ['payout_request', 'payout_approved', 'payout_rejected'] }
    }).populate('seller', 'fullName email businessName phoneNumber bankAccountNumber ifscCode');

    let allPayouts = [];
    wallets.forEach(wallet => {
      wallet.transactions.forEach(tx => {
        if (['payout_request', 'payout_approved', 'payout_rejected'].includes(tx.type)) {
          if (status === 'all' || tx.status === status || (status === 'pending' && tx.type === 'payout_request' && tx.status === 'pending')) {
            allPayouts.push({
              _id: tx._id,
              seller: wallet.seller,
              sellerId: wallet.seller._id,
              amount: tx.amount,
              type: tx.type,
              status: tx.status,
              method: tx.payoutMethod?.type || 'bank_transfer',
              bankDetails: {
                accountNumber: tx.payoutMethod?.bankAccountNumber || wallet.seller.bankAccountNumber || '',
                ifsc: tx.payoutMethod?.bankIfsc || wallet.seller.ifscCode || '',
                upiId: tx.payoutMethod?.upiId || ''
              },
              requestedAt: tx.createdAt,
              processedAt: tx.processedAt,
              processedBy: tx.processedBy,
              rejectionReason: tx.rejectionReason
            });
          }
        }
      });
    });

    // Sort by date
    allPayouts.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allPayouts = allPayouts.filter(p => 
        p.seller.fullName?.toLowerCase().includes(searchLower) ||
        p.seller.email?.toLowerCase().includes(searchLower) ||
        p.seller.businessName?.toLowerCase().includes(searchLower)
      );
    }

    const totalPayouts = allPayouts.length;
    const totalPages = Math.ceil(totalPayouts / limit);
    const paginatedPayouts = allPayouts.slice(skip, skip + limit);

    // Stats
    const stats = {
      total: allPayouts.length,
      pending: allPayouts.filter(p => p.status === 'pending').length,
      approved: allPayouts.filter(p => p.type === 'payout_approved').length,
      rejected: allPayouts.filter(p => p.type === 'payout_rejected').length,
      totalAmount: allPayouts.reduce((sum, p) => sum + (p.status === 'pending' ? p.amount : 0), 0)
    };

    res.render('adminPayments', {
      title: 'Seller Payments - Admin',
      user: req.seller,
      admin: req.seller,
      payouts: paginatedPayouts,
      stats,
      currentPage: page,
      totalPages,
      totalPayouts,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      currentStatus: status,
      searchQuery: search
    });
  } catch (error) {
    console.error("❌ Payments Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load payments'
    });
  }
});

// ====================== APPROVE PAYOUT (ADMIN) ======================
router.post('/payments/:walletId/payout/:transactionId/approve', restrictToAdmin, async (req, res) => {
  try {
    const { transactionId, walletId } = req.params;
    const { referenceNumber, notes } = req.body;

    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    const transaction = wallet.transactions.id(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.type !== 'payout_request' || transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid transaction status' });
    }

    // Update transaction to approved
    transaction.type = 'payout_approved';
    transaction.status = 'completed';
    transaction.processedBy = req.seller._id;
    transaction.processedAt = new Date();
    transaction.description = `Payout approved. Ref: ${referenceNumber || 'N/A'}. ${notes || ''}`;

    await wallet.save();

    res.json({
      success: true,
      message: 'Payout approved and marked as paid',
      payout: {
        id: transaction._id,
        amount: transaction.amount,
        status: 'completed',
        processedAt: transaction.processedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== REJECT PAYOUT (ADMIN) ======================
router.post('/payments/:walletId/payout/:transactionId/reject', restrictToAdmin, async (req, res) => {
  try {
    const { transactionId, walletId } = req.params;
    const { reason } = req.body;

    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    const transaction = wallet.transactions.id(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.type !== 'payout_request' || transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid transaction status' });
    }

    // Return amount to available balance
    wallet.availableBalance += transaction.amount;

    // Update transaction to rejected
    transaction.type = 'payout_rejected';
    transaction.status = 'cancelled';
    transaction.processedBy = req.seller._id;
    transaction.processedAt = new Date();
    transaction.rejectionReason = reason || 'Rejected by admin';
    transaction.description = `Payout rejected. Reason: ${reason || 'Rejected by admin'}`;

    await wallet.save();

    res.json({
      success: true,
      message: 'Payout rejected. Amount returned to seller wallet.',
      payout: {
        id: transaction._id,
        amount: transaction.amount,
        status: 'cancelled',
        rejectionReason: transaction.rejectionReason
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ====================== GET ADMIN ACTIVITY PAGE ======================
router.get('/activity', restrictToAdmin, async (req, res) => {
  try {
    // Get real recent orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('seller', 'businessName')
      .lean();

    // Get real recent seller registrations
    const recentSellers = await Seller.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Build real activity feed
    let activities = [];

    recentOrders.forEach(order => {
      activities.push({
        type: 'order',
        icon: 'shopping-cart',
        title: `New Order ${order.orderNumber}`,
        description: `Order from ${order.customerName} for Rs.${order.totalAmount}`,
        user: order.seller?.businessName || 'Unknown Seller',
        entity: order.orderNumber,
        amount: order.totalAmount,
        createdAt: order.createdAt,
        badge: order.status === 'pending' ? 'New' : order.status,
        badgeType: order.status === 'delivered' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'
      });
    });

    recentSellers.forEach(seller => {
      activities.push({
        type: 'user',
        icon: 'user-plus',
        title: 'New Seller Registration',
        description: `${seller.businessName || seller.fullName} completed registration`,
        user: seller.fullName,
        entity: 'Seller Registration',
        createdAt: seller.createdAt,
        badge: seller.verificationStatus,
        badgeType: seller.verificationStatus === 'Approved' ? 'success' : 'warning'
      });
    });

    // Sort by date
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const stats = {
      today: activities.filter(a => new Date(a.createdAt) > new Date(new Date().setHours(0,0,0,0))).length,
      orders: activities.filter(a => a.type === 'order').length,
      sellers: activities.filter(a => a.type === 'user').length
    };

    res.render('adminActivity', {
      title: 'Activity Feed - Admin',
      user: req.seller,
      admin: req.seller,
      activities: activities.slice(0, 20),
      stats,
      formatTimeAgo
    });
  } catch (error) {
    console.error("❌ Activity Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load activity feed'
    });
  }
});

// ====================== GET ADMIN SETTINGS PAGE ======================
router.get('/settings', restrictToAdmin, async (req, res) => {
  try {
    res.render('adminSettings', {
      title: 'Settings - Admin',
      user: req.seller,
      admin: req.seller
    });
  } catch (error) {
    console.error("❌ Settings Page Error:", error.message);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load settings'
    });
  }
});

// ====================== ADMIN LOGOUT ======================
router.get('/logout', restrictToAdmin, (req, res) => {
  res.clearCookie('token', { path: '/' });
  req.session.destroy?.();
  res.redirect('/seller/signin');
});

module.exports = router;
