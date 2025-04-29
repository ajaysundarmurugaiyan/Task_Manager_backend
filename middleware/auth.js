const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Invalid authorization header format');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findOne({
      _id: decoded.userId,
      active: true
    }).select('+passwordChangedAt');

    if (!user) {
      throw new Error('User not found or deactivated');
    }

    // Check if password was changed after token was issued
    if (user.passwordChangedAt && user.changedPasswordAfter(decoded.iat)) {
      throw new Error('User recently changed password. Please log in again');
    }

    // Add user and token to request
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: error.message || 'Please authenticate'
    });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Please authenticate'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

module.exports = { auth, checkRole }; 