const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const Seller = require('../models/Seller');
const DeliveryAssignment = require('../models/DeliveryAssignment');

class OrderService {
  // Get order analytics
  static async getOrderAnalytics(sellerId, period = 'month') {
    try {
      const now = new Date();
      let startDate;

      if (period === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      const orders = await Order.find({
        seller: sellerId,
        createdAt: { $gte: startDate }
      }).lean();

      const analytics = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + (o.sellerEarnings || 0), 0),
        successfulOrders: orders.filter(o => o.status === 'delivered').length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        returnedOrders: orders.filter(o => o.status === 'returned').length,
        averageOrderValue: orders.length > 0 
          ? orders.reduce((sum, o) => sum + (o.sellerEarnings || 0), 0) / orders.length
          : 0,
        paidOrders: orders.filter(o => o.paymentStatus === 'paid').length,
        codOrders: orders.filter(o => o.paymentMethod === 'cod').length
      };

      return analytics;
    } catch (error) {
      throw new Error(`Order analytics error: ${error.message}`);
    }
  }

  // Process order delivery
  static async processOrderDelivery(orderId, deliveryBoyId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      const assignment = new DeliveryAssignment({
        order: orderId,
        seller: order.seller,
        deliveryBoy: deliveryBoyId,
        pickupLocation: {
          warehouseAddress: 'Warehouse Address', // Set from seller warehouse
          coordinates: { type: 'Point', coordinates: [0, 0] }
        },
        deliveryLocation: {
          fullName: order.shippingAddress.fullName,
          phone: order.shippingAddress.phone,
          street: order.shippingAddress.street,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          pincode: order.shippingAddress.pincode,
          coordinates: {
            type: 'Point',
            coordinates: order.shippingAddress.coordinates?.coordinates || [0, 0]
          }
        },
        status: 'assigned'
      });

      await assignment.save();
      
      order.deliveryAssignment = assignment._id;
      order.deliveryBoy = deliveryBoyId;
      order.status = 'ready_for_pickup';
      await order.save();

      return assignment;
    } catch (error) {
      throw new Error(`Delivery processing error: ${error.message}`);
    }
  }

  // Release order funds
  static async releaseFunds(orderId, adminId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');
      if (order.fundsReleased) throw new Error('Funds already released');
      if (order.status !== 'delivered') throw new Error('Order must be delivered');

      const wallet = await Wallet.getOrCreate(order.seller);
      const amount = order.sellerEarnings;

      await wallet.addTransaction(
        'credit',
        amount,
        `Earnings from order ${order.orderNumber}`,
        { order: orderId, processedBy: adminId }
      );

      order.fundsReleased = true;
      order.fundsReleasedAt = new Date();
      await order.save();

      return {
        success: true,
        message: 'Funds released',
        amount
      };
    } catch (error) {
      throw new Error(`Fund release error: ${error.message}`);
    }
  }

  // Process refund
  static async processRefund(orderId, refundAmount, reason, adminId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      await order.processRefund(refundAmount, reason, adminId);

      const wallet = await Wallet.getOrCreate(order.seller);
      await wallet.addTransaction(
        'refund',
        refundAmount,
        `Refund for order ${order.orderNumber}: ${reason}`,
        { order: orderId, processedBy: adminId }
      );

      return {
        success: true,
        message: 'Refund processed',
        refundAmount
      };
    } catch (error) {
      throw new Error(`Refund processing error: ${error.message}`);
    }
  }
}

module.exports = OrderService;