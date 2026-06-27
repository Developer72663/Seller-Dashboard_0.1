const DeliveryAssignment = require('../models/DeliveryAssignment');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');

class DeliveryService {
  // Get nearby delivery boys
  static async getNearbyDeliveryBoys(longitude, latitude, maxDistance = 5) {
    try {
      const deliveryBoys = await DeliveryBoy.find({
        status: 'active',
        isAvailable: true,
        'currentLocation.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: maxDistance * 1000 // Convert km to meters
          }
        }
      })
      .select('fullName phone currentLocation totalDeliveries averageRating')
      .limit(10)
      .lean();

      return deliveryBoys;
    } catch (error) {
      throw new Error(`Get nearby delivery boys error: ${error.message}`);
    }
  }

  // Assign delivery
  static async assignDelivery(assignmentId, deliveryBoyId) {
    try {
      const assignment = await DeliveryAssignment.findById(assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
      if (!deliveryBoy) throw new Error('Delivery boy not found');
      if (deliveryBoy.currentAssignments >= deliveryBoy.maxAssignmentsPerDay) {
        throw new Error('Delivery boy has reached max assignments');
      }

      assignment.deliveryBoy = deliveryBoyId;
      assignment.status = 'assigned';
      await assignment.save();

      deliveryBoy.currentAssignments += 1;
      await deliveryBoy.save();

      const order = await Order.findById(assignment.order);
      order.deliveryBoy = deliveryBoyId;
      await order.save();

      return assignment;
    } catch (error) {
      throw new Error(`Delivery assignment error: ${error.message}`);
    }
  }

  // Update delivery location
  static async updateDeliveryLocation(assignmentId, latitude, longitude, address, status) {
    try {
      const assignment = await DeliveryAssignment.findById(assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      await assignment.updateLocation(latitude, longitude, address, status);
      return assignment;
    } catch (error) {
      throw new Error(`Location update error: ${error.message}`);
    }
  }

  // Mark delivery complete
  static async completeDelivery(assignmentId, proofData) {
    try {
      const assignment = await DeliveryAssignment.findById(assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      await assignment.markDelivered(proofData);

      const order = await Order.findById(assignment.order);
      order.status = 'delivered';
      order.deliveredAt = new Date();
      await order.save();

      const deliveryBoy = await DeliveryBoy.findById(assignment.deliveryBoy);
      await deliveryBoy.recordDelivery(true);
      deliveryBoy.currentAssignments = Math.max(0, deliveryBoy.currentAssignments - 1);
      await deliveryBoy.save();

      return assignment;
    } catch (error) {
      throw new Error(`Complete delivery error: ${error.message}`);
    }
  }

  // Report delivery issue
  static async reportDeliveryIssue(assignmentId, issueData) {
    try {
      const assignment = await DeliveryAssignment.findById(assignmentId);
      if (!assignment) throw new Error('Assignment not found');

      await assignment.reportIssue(issueData);

      const deliveryBoy = await DeliveryBoy.findById(assignment.deliveryBoy);
      await deliveryBoy.recordDelivery(false);
      deliveryBoy.currentAssignments = Math.max(0, deliveryBoy.currentAssignments - 1);
      await deliveryBoy.save();

      return assignment;
    } catch (error) {
      throw new Error(`Report issue error: ${error.message}`);
    }
  }

  // Get delivery analytics
  static async getDeliveryAnalytics(deliveryBoyId, period = 'month') {
    try {
      const now = new Date();
      let startDate;

      if (period === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const assignments = await DeliveryAssignment.find({
        deliveryBoy: deliveryBoyId,
        createdAt: { $gte: startDate }
      }).lean();

      const deliveredCount = assignments.filter(a => a.status === 'delivered').length;
      const failedCount = assignments.filter(a => a.status === 'failed').length;
      const totalEarnings = assignments.reduce((sum, a) => sum + (a.deliveryCharges || 0), 0);

      return {
        totalAssignments: assignments.length,
        delivered: deliveredCount,
        failed: failedCount,
        successRate: assignments.length > 0 ? (deliveredCount / assignments.length * 100).toFixed(2) : 0,
        totalEarnings
      };
    } catch (error) {
      throw new Error(`Delivery analytics error: ${error.message}`);
    }
  }
}

module.exports = DeliveryService;