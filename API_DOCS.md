# Shopp123 Admin & Seller Dashboard API Documentation

## Authentication

### Admin Login
```
POST /admin/login
Body: { email, password }
Response: { token, admin }
```

### Seller Login
```
POST /seller/login
Body: { email, password }
Response: { token, seller }
```

### Delivery Boy Login
```
POST /delivery/login
Body: { email, password }
Response: { token, deliveryBoy }
```

## Admin Dashboard APIs

### Dashboard Overview
```
GET /admin/dashboard
Auth: Required
Response: { analytics, monthlyRevenue, topSellers, deliveryMetrics }
```

### Seller Management
```
GET /admin/sellers - Get all sellers
GET /admin/sellers/:sellerId - Get seller details
POST /admin/sellers/:sellerId/approve - Approve seller
POST /admin/sellers/:sellerId/reject - Reject seller
POST /admin/sellers/:sellerId/suspend - Suspend seller
POST /admin/sellers/:sellerId/activate - Activate seller
```

### Order Management
```
GET /admin/orders - Get all orders
GET /admin/orders/:orderId - Get order details
PATCH /admin/orders/:orderId/status - Update order status
POST /admin/orders/:orderId/refund - Process refund
POST /admin/orders/:orderId/release-funds - Release seller funds
```

### Delivery Management
```
GET /admin/delivery/boys - Get all delivery boys
GET /admin/delivery/boys/:deliveryBoyId - Get delivery boy details
POST /admin/delivery/boys/:deliveryBoyId/verify - Verify delivery boy
GET /admin/delivery/assignments - Get all assignments
```

## Seller Dashboard APIs

### Profile
```
GET /seller/profile
PUT /seller/profile - Update profile
GET /seller/analytics - Get seller analytics
```

### Orders
```
GET /seller/orders - Get seller orders
GET /seller/orders/:orderId - Get order details
PATCH /seller/orders/:orderId/status - Update order status
```

### Earnings
```
GET /seller/earnings - Get earnings overview
GET /seller/earnings/payouts - Get payout history
POST /seller/earnings/payout - Request payout
```

## Delivery Boy APIs

### Profile
```
GET /delivery/profile
POST /delivery/location/update - Update current location
```

### Deliveries
```
GET /delivery/assignments - Get assigned deliveries
GET /delivery/assignments/:assignmentId - Get delivery details
PATCH /delivery/assignments/:assignmentId/status - Update status
POST /delivery/assignments/:assignmentId/complete - Mark delivered
POST /delivery/assignments/:assignmentId/issue - Report issue
```

### Analytics
```
GET /delivery/analytics/summary - Get delivery analytics
```

## Error Responses

```json
{
  "success": false,
  "message": "Error message"
}
```

## Status Codes
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error