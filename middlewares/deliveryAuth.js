const { verifyToken } = require('../services/authentication');
const DeliveryBoy = require('../models/DeliveryBoy');

const isDeliveryAuth = async (req, res, next) => {
    const token = req.cookies['token'];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        // Verify this is a delivery boy
        const deliveryBoy = await DeliveryBoy.findById(decoded._id);
        if (!deliveryBoy) {
            return res.status(403).json({
                success: false,
                message: 'Access Denied: Delivery Boy Only'
            });
        }

        if (deliveryBoy.status !== 'active' && deliveryBoy.status !== 'verified') {
            return res.status(403).json({
                success: false,
                message: 'Your account is not active'
            });
        }

        req.deliveryBoy = deliveryBoy;
        next();
    } catch (error) {
        res.clearCookie('token', { path: '/' });
        return res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

module.exports = {
    isDeliveryAuth
};