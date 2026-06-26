const express = require('express');
const router = express.Router();
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');

// ===================== AUTH MIDDLEWARE =====================
const requireSellerAuth = async (req, res, next) => {
  try {
    if (!req.seller) {
      return res.redirect('/seller/signin');
    }
    const seller = await Seller.findById(req.seller._id).select('-password').lean();
    if (!seller) {
      res.clearCookie('token');
      return res.redirect('/seller/signin');
    }
    req.sellerData = seller;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.redirect('/seller/signin');
  }
};

// ===================== EARNINGS PAGE =====================
router.get('/', requireSellerAuth, async (req, res) => {
  try {
    const sellerId = req.sellerData._id;
    const seller = req.sellerData;

    // Get or create wallet
    const wallet = await Wallet.getOrCreate(sellerId);

    // Calculate stats from orders
    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let pendingAmount = 0;
    let totalOrders = 0;
    let totalProducts = 0;
    let earningsHistory = [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const orders = await Order.find({ seller: sellerId }).lean();
    totalOrders = orders.length;

    orders.forEach(order => {
      const orderTotal = order.sellerEarnings || 0;
      totalRevenue += orderTotal;

      const orderDate = new Date(order.createdAt);
      if (orderDate >= startOfMonth) {
        thisMonthRevenue += orderTotal;
      }

      if (order.status === 'delivered' && !order.fundsReleased) {
        pendingAmount += orderTotal;
      }
    });

    // Build earnings history (last 6 months)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = {};

    orders.forEach(order => {
      const d = new Date(order.createdAt);
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
      if (!monthlyData[key]) monthlyData[key] = { amount: 0, orders: 0 };
      monthlyData[key].amount += order.sellerEarnings || 0;
      monthlyData[key].orders += 1;
    });

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
      earningsHistory.push({
        month: key,
        amount: monthlyData[key]?.amount || 0,
        orders: monthlyData[key]?.orders || 0
      });
    }

    // Get product count
    let Product;
    try { Product = require('../models/Product'); } catch(e) { Product = null; }
    if (Product) {
      totalProducts = await Product.countDocuments({ seller: sellerId });
    }

    // Get pending payout requests
    const pendingPayouts = wallet.transactions.filter(
      t => t.type === 'payout_request' && t.status === 'pending'
    );

    res.render('sellerEarnings', {
      title: 'Earnings - SellerHub',
      seller: seller,
      wallet: wallet,
      stats: {
        totalRevenue,
        thisMonthRevenue,
        pendingAmount,
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        totalOrders,
        totalProducts,
        platformFeeRate: 10,
        netEarnings: wallet.totalEarned
      },
      earningsHistory,
      pendingPayouts,
      payoutSettings: wallet.payoutSettings,
      currency: '₹',
      minPayout: 1000
    });
  } catch (err) {
    console.error('Earnings error:', err);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load earnings data'
    });
  }
});

// ===================== REQUEST PAYOUT =====================
router.post('/payout', requireSellerAuth, async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;
    const sellerId = req.sellerData._id;
    const MIN_PAYOUT = 1000;

    const amountNum = parseFloat(amount);
    if (!amountNum || isNaN(amountNum) || amountNum < MIN_PAYOUT) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout amount is ₹${MIN_PAYOUT}`
      });
    }

    const wallet = await Wallet.getOrCreate(sellerId);

    // Update payout settings if provided
    if (accountDetails) {
      if (accountDetails.bankAccountNumber) wallet.payoutSettings.bankAccountNumber = accountDetails.bankAccountNumber;
      if (accountDetails.bankIfsc) wallet.payoutSettings.bankIfsc = accountDetails.bankIfsc;
      if (accountDetails.bankAccountName) wallet.payoutSettings.bankAccountName = accountDetails.bankAccountName;
      if (accountDetails.bankName) wallet.payoutSettings.bankName = accountDetails.bankName;
      if (accountDetails.upiId) wallet.payoutSettings.upiId = accountDetails.upiId;
      if (method) wallet.payoutSettings.preferredMethod = method;
    }

    // Request payout
    const transaction = await wallet.requestPayout(amountNum, {
      type: method || wallet.payoutSettings.preferredMethod,
      bankAccountNumber: wallet.payoutSettings.bankAccountNumber,
      bankIfsc: wallet.payoutSettings.bankIfsc,
      upiId: wallet.payoutSettings.upiId
    });

    res.json({
      success: true,
      message: 'Payout request submitted successfully. Admin will process it within 3-5 business days.',
      payoutId: transaction._id,
      amount: amountNum,
      status: 'pending'
    });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to process payout request'
    });
  }
});

// ===================== GET PAYOUT HISTORY =====================
router.get('/payouts', requireSellerAuth, async (req, res) => {
  try {
    const sellerId = req.sellerData._id;
    const wallet = await Wallet.getOrCreate(sellerId);

    const payouts = wallet.transactions
      .filter(t => ['payout_request', 'payout_approved', 'payout_rejected'].includes(t.type))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      payouts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===================== EARNINGS API (JSON) =====================
router.get('/api/summary', requireSellerAuth, async (req, res) => {
  try {
    const sellerId = req.sellerData._id;
    const wallet = await Wallet.getOrCreate(sellerId);

    const orders = await Order.find({ seller: sellerId }).lean();
    const totalRevenue = orders.reduce((sum, o) => sum + (o.sellerEarnings || 0), 0);
    const totalOrders = orders.length;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
        currency: '₹'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
