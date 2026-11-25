const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const ShiftLog = require('../models/ShiftLog');

// ── protect: verify JWT ────────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password_hash');
    if (!req.user) return res.status(401).json({ success: false, message: 'User not found' });
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalid' });
  }
};

// ── authorize: role check ─────────────────────────────────────────────────
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: `Role '${req.user.role}' is not authorized` });
  }
  next();
};

// ── requireCheckIn: staff (manager/captain/chef/delivery) must be checked in
// Owner is EXEMPT from check-in.
const CHECK_IN_ROLES = ['manager', 'captain', 'chef', 'delivery'];

exports.requireCheckIn = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authorized' });
  // Owner always has access — no check-in required
  if (req.user.role === 'owner') return next();
  // Customer has no check-in
  if (req.user.role === 'customer') return next();
  // Staff roles must be checked in
  if (!CHECK_IN_ROLES.includes(req.user.role)) return next();

  // Fast path: flag was written by POST /api/shifts/checkin
  if (req.user.is_checked_in) return next();

  // Fallback: an active shift row also proves the user is on duty. Covers
  // shifts opened before the flag was kept in sync — otherwise those users
  // would see "On Shift" in the UI yet get rejected by the API.
  try {
    const active = await ShiftLog.findOne({ user_id: req.user._id, status: 'active' }).select('_id').lean();
    if (active) {
      await User.findByIdAndUpdate(req.user._id, { is_checked_in: true }); // self-heal
      return next();
    }
  } catch (_) { /* fall through to the 403 below */ }

  return res.status(403).json({
    success: false,
    message: 'Please check in to start your shift before performing this action.',
    code: 'CHECK_IN_REQUIRED',
  });
};