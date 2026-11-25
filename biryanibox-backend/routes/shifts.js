const express = require('express');
const router = express.Router();
const ShiftLog = require('../models/ShiftLog');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// GET /api/shifts — list shifts (owner/manager see all, others see own)
router.get('/', protect, async (req, res, next) => {
  try {
    const { date, user_id, role, period } = req.query;
    const filter = {};

    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      filter.user_id = req.user._id;
    } else if (user_id) {
      filter.user_id = user_id;
    }

    if (date) filter.date = date;
    if (role) filter.role = role;

    if (period) {
      if (period === 'today') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        filter.check_in = { $gte: todayStart, $lte: todayEnd };
      } else if (period === 'weekly') {
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        filter.check_in = { $gte: weekAgo };
      } else if (period === 'monthly') {
        const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
        filter.check_in = { $gte: monthAgo };
      }
    }

    const shifts = await ShiftLog.find(filter)
      .populate('user_id', 'name role email phone')
      .sort({ created_at: -1 });
    res.json({ success: true, count: shifts.length, data: shifts });
  } catch (err) { next(err); }
});

// GET /api/shifts/active — currently checked-in staff
router.get('/active', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const shifts = await ShiftLog.find({ status: 'active' })
      .populate('user_id', 'name role email phone avatar_url');
    res.json({ success: true, data: shifts });
  } catch (err) { next(err); }
});

// POST /api/shifts/checkin
router.post('/checkin', protect, async (req, res, next) => {
  try {
    // Idempotent: an active shift already exists → just re-sync the user flag
    const existing = await ShiftLog.findOne({ user_id: req.user._id, status: 'active' });
    if (existing) {
      await User.findByIdAndUpdate(req.user._id, { is_checked_in: true });
      return res.json({ success: true, data: existing, message: 'Already checked in' });
    }

    const shift = await ShiftLog.create({
      user_id: req.user._id,
      role: req.user.role,
      check_in: new Date(),
      date: new Date().toISOString().split('T')[0],
      status: 'active',
      notes: req.body?.notes || '',
    });
    // requireCheckIn middleware reads this flag — keep it in sync with the shift log
    await User.findByIdAndUpdate(req.user._id, { is_checked_in: true, last_checkin_at: shift.check_in });
    res.status(201).json({ success: true, data: shift });
  } catch (err) { next(err); }
});

// PATCH /api/shifts/:id/checkout
router.patch('/:id/checkout', protect, async (req, res, next) => {
  try {
    const shift = await ShiftLog.findById(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });

    if (shift.user_id.toString() !== req.user._id.toString() &&
        !['owner', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const checkOut = new Date();
    const duration = Math.round((checkOut - shift.check_in) / 60000); // minutes

    const updated = await ShiftLog.findByIdAndUpdate(req.params.id, {
      check_out: checkOut,
      duration_minutes: duration,
      status: 'completed',
      notes: req.body.notes || shift.notes,
    }, { new: true }).populate('user_id', 'name role');

    // Keep the check-in flag of the shift owner in sync
    await User.findByIdAndUpdate(shift.user_id, {
      is_checked_in: false,
      last_checkout_at: checkOut,
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /api/shifts/my-active — get current user's active shift
router.get('/my-active', protect, async (req, res, next) => {
  try {
    const shift = await ShiftLog.findOne({ user_id: req.user._id, status: 'active' });
    res.json({ success: true, data: shift });
  } catch (err) { next(err); }
});

// GET /api/shifts/checkin-status — current user's check-in status
router.get('/checkin-status', protect, async (req, res, next) => {
  try {
    const active = await ShiftLog.findOne({ user_id: req.user._id, status: 'active' });
    res.json({
      success: true,
      data: {
        is_checked_in:   !!active,
        last_checkin_at: active?.check_in || req.user.last_checkin_at || null,
        name: req.user.name,
        role: req.user.role,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/shifts/checkout — close the caller's active shift (no id needed)
router.post('/checkout', protect, async (req, res, next) => {
  try {
    const shift = await ShiftLog.findOne({ user_id: req.user._id, status: 'active' });
    if (!shift) {
      await User.findByIdAndUpdate(req.user._id, { is_checked_in: false });
      return res.status(400).json({ success: false, message: 'Not checked in' });
    }

    const checkOut = new Date();
    shift.check_out        = checkOut;
    shift.duration_minutes = Math.round((checkOut - shift.check_in) / 60000);
    shift.status           = 'completed';
    if (req.body?.notes) shift.notes = req.body.notes;
    await shift.save();

    await User.findByIdAndUpdate(req.user._id, {
      is_checked_in: false,
      last_checkout_at: checkOut,
    });

    res.json({ success: true, data: shift, message: 'Checked out successfully' });
  } catch (err) { next(err); }
});

// POST /api/shifts — manual shift creation (owner/manager)
router.post('/', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const shift = await ShiftLog.create(req.body);
    res.status(201).json({ success: true, data: shift });
  } catch (err) { next(err); }
});

// DELETE /api/shifts/:id
router.delete('/:id', protect, authorize('owner'), async (req, res, next) => {
  try {
    await ShiftLog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Shift deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
