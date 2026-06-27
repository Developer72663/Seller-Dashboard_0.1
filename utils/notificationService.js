const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

class NotificationService {
  // Order notifications
  static async notifyOrderPlaced(order) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>Order Confirmed</h2>
          <p>Your order #${order.orderNumber} has been placed successfully!</p>
          <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
          <p><strong>Status:</strong> ${order.status}</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: order.customerEmail,
        subject: `Order Confirmed - #${order.orderNumber}`,
        html
      });
    } catch (error) {
      console.error('Order notification error:', error.message);
    }
  }

  static async notifyOrderShipped(order) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>Order Shipped</h2>
          <p>Your order #${order.orderNumber} is on its way!</p>
          <p><strong>Tracking Number:</strong> ${order.trackingNumber || 'N/A'}</p>
          <p><strong>Expected Delivery:</strong> ${new Date(order.estimatedDelivery).toLocaleDateString()}</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: order.customerEmail,
        subject: `Order Shipped - #${order.orderNumber}`,
        html
      });
    } catch (error) {
      console.error('Shipment notification error:', error.message);
    }
  }

  static async notifyOrderDelivered(order) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>Order Delivered</h2>
          <p>Your order #${order.orderNumber} has been delivered!</p>
          <p><strong>Delivered On:</strong> ${new Date(order.deliveredAt).toLocaleDateString()}</p>
          <p>Thank you for your purchase!</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: order.customerEmail,
        subject: `Order Delivered - #${order.orderNumber}`,
        html
      });
    } catch (error) {
      console.error('Delivery notification error:', error.message);
    }
  }

  // Seller notifications
  static async notifySellerNewOrder(seller, order) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>New Order Received</h2>
          <p>You have received a new order!</p>
          <p><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p><strong>Amount:</strong> ₹${order.sellerEarnings}</p>
          <p><strong>Items:</strong> ${order.items.length}</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: seller.email,
        subject: `New Order - #${order.orderNumber}`,
        html
      });
    } catch (error) {
      console.error('Seller notification error:', error.message);
    }
  }

  // Payment notifications
  static async notifyPaymentReceived(seller, amount) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>Payment Received</h2>
          <p>We have received your payment!</p>
          <p><strong>Amount:</strong> ₹${amount}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: seller.email,
        subject: 'Payment Received',
        html
      });
    } catch (error) {
      console.error('Payment notification error:', error.message);
    }
  }

  // Delivery boy notifications
  static async notifyDeliveryAssigned(deliveryBoy, assignment) {
    try {
      const html = `
        <div style="font-family: Arial; max-width: 600px;">
          <h2>New Delivery Assignment</h2>
          <p>You have been assigned a new delivery!</p>
          <p><strong>Delivery Location:</strong> ${assignment.deliveryLocation.city}, ${assignment.deliveryLocation.state}</p>
          <p><strong>Recipient:</strong> ${assignment.deliveryLocation.fullName}</p>
          <p><strong>Phone:</strong> ${assignment.deliveryLocation.phone}</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Shopp123" <${process.env.EMAIL_USER}>`,
        to: deliveryBoy.email,
        subject: 'New Delivery Assignment',
        html
      });
    } catch (error) {
      console.error('Delivery notification error:', error.message);
    }
  }
}

module.exports = NotificationService;