module.exports = {
  ORDER_STATUS: [
    'pending',
    'confirmed',
    'processing',
    'ready_for_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'returned',
    'refunded'
  ],

  PAYMENT_STATUS: [
    'pending',
    'paid',
    'failed',
    'refunded',
    'partial_refund',
    'cancelled'
  ],

  PAYMENT_METHODS: [
    'cod',
    'online',
    'upi',
    'card',
    'wallet'
  ],

  SELLER_STATUS: [
    'active',
    'inactive',
    'suspended'
  ],

  SELLER_VERIFICATION: [
    'Pending',
    'Approved',
    'Rejected',
    'Suspended'
  ],

  DELIVERY_BOY_STATUS: [
    'pending',
    'verified',
    'active',
    'inactive',
    'suspended'
  ],

  DELIVERY_STATUS: [
    'assigned',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed',
    'returned',
    'cancelled'
  ],

  ADMIN_ROLES: [
    'SUPER_ADMIN',
    'ADMIN',
    'MODERATOR'
  ],

  ADMIN_PERMISSIONS: [
    'manage_sellers',
    'manage_orders',
    'manage_delivery_boys',
    'manage_products',
    'manage_payments',
    'manage_disputes',
    'view_analytics',
    'manage_admins',
    'manage_refunds'
  ],

  PLATFORM_FEE_PERCENTAGE: 10,
  SELLER_COMMISSION_PERCENTAGE: 90,
  MIN_PAYOUT_AMOUNT: 1000,
  RETURN_POLICY_DAYS: 7,
  MAX_DELIVERY_ASSIGNMENTS: 20
};