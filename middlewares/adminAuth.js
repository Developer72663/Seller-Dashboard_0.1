const { verifyToken } = require('../services/authentication');

const isAdminAuth = (req, res, next) => {
    const token = req.cookies['token'];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = verifyToken(token);
        if (!decoded || decoded.role !== 'SUPER_ADMIN' && decoded.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Access Denied: Admin Only'
            });
        }

        req.admin = decoded;
        req.session.adminId = decoded._id;
        next();
    } catch (error) {
        res.clearCookie('token', { path: '/' });
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

const checkPermission = (requiredPermissions = []) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (req.admin.role === 'SUPER_ADMIN') {
            return next();
        }

        if (requiredPermissions.length > 0) {
            const hasPermission = requiredPermissions.some(perm => 
                req.admin.permissions && req.admin.permissions.includes(perm)
            );

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission for this action'
                });
            }
        }

        next();
    };
};

module.exports = {
    isAdminAuth,
    checkPermission
};