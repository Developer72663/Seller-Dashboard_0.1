const Order = require('../models/Order');
const Seller = require('../models/Seller');
const DeliveryBoy = require('../models/DeliveryBoy');
const DeliveryAssignment = require('../models/DeliveryAssignment');

class AnalyticsService {
  // Admin Dashboard Analytics
  static async getAdminDashboardAnalytics() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const [totalOrders, totalRevenue, totalSellers, activeDeliveryBoys, thisMonthOrders, thisYearRevenue] = await Promise.all([
        Order.countDocuments(),
        Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Seller.countDocuments({ verificationStatus: 'Approved' }),
        DeliveryBoy.countDocuments({ status: 'active' }),
        Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
        Order.aggregate([{
          $match: { createdAt: { $gte: startOfYear } },
          $group: { _id: null, total: { $sum: '$totalAmount' } }
        }])
      ]);

      const pendingPayouts = await Order.countDocuments({ 
        status: 'delivered', 
        fundsReleased: false 
      });

      const stats = {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalSellers,
        activeDeliveryBoys,
        thisMonthOrders,
        thisYearRevenue: thisYearRevenue[0]?.total || 0,
        pendingPayouts,
        platformEarnings: (totalRevenue[0]?.total || 0) * 0.1 // 10% platform fee
      };

      return stats;
    } catch (error) {
      throw new Error(`Admin analytics error: ${error.message}`);
    }
  }

  // Seller Performance Analytics
  static async getSellerPerformanceAnalytics(sellerId) {
    try {
      const orders = await Order.find({ seller: sellerId }).lean();
      const seller = await Seller.findById(sellerId).lean();

      const analytics = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + (o.sellerEarnings || 0), 0),
        successfulOrders: orders.filter(o => o.status === 'delivered').length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        returnedOrders: orders.filter(o => o.status === 'returned').length,
        averageRating: seller?.rating || 0,
        totalReviews: seller?.totalReviews || 0,
        successRate: orders.length > 0 
          ? ((orders.filter(o => o.status === 'delivered').length / orders.length) * 100).toFixed(2)
          : 0
      };

      return analytics;
    } catch (error) {
      throw new Error(`Seller analytics error: ${error.message}`);
    }
  }

  // Monthly Revenue Report
  static async getMonthlyRevenueReport(months = 12) {
    try {
      const report = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        const revenue = await Order.aggregate([
          {
            $match: {
              createdAt: { $gte: date, $lt: nextDate },
              paymentStatus: 'paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' },
              platformFee: { $sum: '$platformFee' },
              count: { $sum: 1 }
            }
          }
        ]);

        report.push({
          month: date.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          revenue: revenue[0]?.total || 0,
          platformFee: revenue[0]?.platformFee || 0,
          orders: revenue[0]?.count || 0
        });
      }

      return report;
    } catch (error) {
      throw new Error(`Revenue report error: ${error.message}`);
    }
  }

  // Seller Rankings
  static async getSellerRankings(limit = 10) {
    try {
      const sellers = await Seller.find({ verificationStatus: 'Approved' })
        .sort({ rating: -1, totalOrders: -1 })
        .limit(limit)
        .select('fullName businessName rating totalOrders totalReviews totalIncome')
        .lean();

      return sellers;
    } catch (error) {
      throw new Error(`Seller rankings error: ${error.message}`);
    }
  }

  // Delivery Performance
  static async getDeliveryPerformanceAnalytics() {
    try {
      const [totalAssignments, deliveredCount, failedCount, averageRating] = await Promise.all([
        DeliveryAssignment.countDocuments(),
        DeliveryAssignment.countDocuments({ status: 'delivered' }),
        DeliveryAssignment.countDocuments({ status: 'failed' }),
        DeliveryAssignment.aggregate([
          { $match: { deliveryBoyRating: { $exists: true } } },
          { $group: { _id: null, avg: { $avg: '$deliveryBoyRating' } } }
        ])
      ]);

      return {
        totalAssignments,
        delivered: deliveredCount,
        failed: failedCount,
        successRate: totalAssignments > 0 ? ((deliveredCount / totalAssignments) * 100).toFixed(2) : 0,
        averageRating: averageRating[0]?.avg || 0
      };
    } catch (error) {
      throw new Error(`Delivery analytics error: ${error.message}`);
    }
  }
}

module.exports = AnalyticsService;