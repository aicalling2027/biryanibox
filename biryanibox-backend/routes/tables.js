const express = require('express');
const router  = express.Router();
const RestaurantTable = require('../models/RestaurantTable');
const User            = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// ── Seed 9 tables on startup ───────────────────────────────────────────────
// Zone map:
//   Waiter 1 → Tables 1, 2, 3   (regular)
//   Waiter 2 → Tables 4, 5, 6   (regular)
//   Waiter 3 → Tables 7, 8, 9   (regular/vip)
//   Waiter 4 → no tables (delivery/pickup orders only)
async function seedTables() {
  try {
    const count = await RestaurantTable.countDocuments({ is_active: true });
    if (count >= 9) {
      console.log('[Tables] Tables already exist — skipping seed (waiter assignments preserved)');
      return;
    }
    // Only seed from scratch if tables don't exist
    // Run utils/seed.js to fully reset with waiter zone assignments
    const tables = [
      { table_number: 1, label: 'Table 1', capacity: 4,  type: 'regular', status: 'available', is_active: true },
      { table_number: 2, label: 'Table 2', capacity: 4,  type: 'regular', status: 'available', is_active: true },
      { table_number: 3, label: 'Table 3', capacity: 6,  type: 'regular', status: 'available', is_active: true },
      { table_number: 4, label: 'Table 4', capacity: 6,  type: 'regular', status: 'available', is_active: true },
      { table_number: 5, label: 'Table 5', capacity: 8,  type: 'regular', status: 'available', is_active: true },
      { table_number: 6, label: 'Table 6', capacity: 8,  type: 'regular', status: 'available', is_active: true },
      { table_number: 7, label: 'Table 7', capacity: 10, type: 'vip',     status: 'available', is_active: true },
      { table_number: 8, label: 'Table 8', capacity: 12, type: 'vip',     status: 'available', is_active: true },
      { table_number: 9, label: 'Table 9', capacity: 8,  type: 'vip',     status: 'available', is_active: true },
    ];
    await RestaurantTable.insertMany(tables);
    console.log('[Tables] 9 tables seeded: Tables 1-9');
    console.log('[Tables] NOTE: Run utils/seed.js to assign waiters to their zones');
  } catch (err) {
    console.error('[Tables] Seed error:', err.message);
  }
}
seedTables();

// ── GET /api/tables  — all tables with waiter ─────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const tables = await RestaurantTable.find({ is_active: true })
      .populate('waiter_id', 'name email phone')
      .sort({ table_number: 1 });
    res.json({ success: true, count: tables.length, data: tables });
  } catch (err) { next(err); }
});

// ── GET /api/tables/available ──────────────────────────────────────────────
router.get('/available', async (req, res, next) => {
  try {
    const tables = await RestaurantTable.find({ is_active: true, status: 'available' })
      .populate('waiter_id', 'name')
      .sort({ table_number: 1 });
    res.json({ success: true, count: tables.length, data: tables });
  } catch (err) { next(err); }
});

// ── GET /api/tables/my-tables  — waiter's own tables ─────────────────────
router.get('/my-tables', protect, authorize('waiter'), async (req, res, next) => {
  try {
    const tables = await RestaurantTable.find({ waiter_id: req.user._id, is_active: true })
      .sort({ table_number: 1 });
    res.json({ success: true, data: tables });
  } catch (err) { next(err); }
});

// ── GET /api/tables/waiter-zone/:waiterId  — zone info for a waiter ────
router.get('/waiter-zone/:waiterId', protect, async (req, res, next) => {
  try {
    const tables = await RestaurantTable.find({ waiter_id: req.params.waiterId, is_active: true })
      .sort({ table_number: 1 });
    const isDeliveryWaiter = tables.length === 0;
    res.json({
      success: true,
      data: {
        tables,
        tableNumbers: tables.map(t => t.table_number),
        isDeliveryWaiter,
        zoneLabel: isDeliveryWaiter
          ? 'Delivery & Pickup'
          : tables.map(t => t.label).join(', '),
      }
    });
  } catch (err) { next(err); }
});

// ── POST /api/tables  — create a new table (owner/manager only) ───────────
router.post('/', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const { label, capacity, type, waiter_id } = req.body;

    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Table label is required' });
    }

    // Check for duplicate label
    const existingLabel = await RestaurantTable.findOne({ label: label.trim() });
    if (existingLabel) {
      return res.status(400).json({ success: false, message: `A table with label "${label.trim()}" already exists` });
    }

    // Auto-assign next table_number
    const last = await RestaurantTable.findOne().sort({ table_number: -1 });
    const nextNumber = last ? last.table_number + 1 : 1;

    // Validate waiter if provided
    if (waiter_id) {
      const waiter = await User.findOne({ _id: waiter_id, role: 'waiter' });
      if (!waiter) return res.status(400).json({ success: false, message: 'User is not a waiter' });
    }

    const table = await RestaurantTable.create({
      table_number: nextNumber,
      label: label.trim(),
      capacity: capacity || 4,
      type: type || 'regular',
      status: 'available',
      waiter_id: waiter_id || null,
      is_active: true,
    });

    const populated = await RestaurantTable.findById(table._id).populate('waiter_id', 'name email');
    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
});

// ── PATCH /api/tables/:id/status ──────────────────────────────────────────
router.patch('/:id/status', protect, async (req, res, next) => {
  try {
    const table = await RestaurantTable.findById(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    // Waiters can only update their own tables
    if (req.user.role === 'waiter') {
      if (!table.waiter_id || table.waiter_id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'You can only update your assigned tables' });
      }
    }

    const updated = await RestaurantTable.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── PATCH /api/tables/:id/assign-waiter ──────────────────────────────────
router.patch('/:id/assign-waiter', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const { waiter_id } = req.body;
    if (waiter_id) {
      const waiter = await User.findOne({ _id: waiter_id, role: 'waiter' });
      if (!waiter) return res.status(400).json({ success: false, message: 'User is not a waiter' });
    }
    const table = await RestaurantTable.findByIdAndUpdate(
      req.params.id,
      { waiter_id: waiter_id || null },
      { new: true }
    ).populate('waiter_id', 'name email');
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, data: table });
  } catch (err) { next(err); }
});

// ── POST /api/tables/assign-waiters-bulk ─────────────────────────────────
// Supports zone-bulk assignment:
//   { zone: 1, waiter_id: "<id>" }  → assigns tables 1-3
//   { zone: 2, waiter_id: "<id>" }  → assigns tables 4-6
//   { zone: 3, waiter_id: "<id>" }  → assigns tables 7-9
// OR traditional { assignments: [{ table_number, waiter_id }] }
router.post('/assign-waiters-bulk', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const { assignments, zone, waiter_id } = req.body;

    // Zone shortcut
    if (zone !== undefined && waiter_id !== undefined) {
      const zoneMap = {
        1: [1, 2, 3],
        2: [4, 5, 6],
        3: [7, 8, 9],
      };
      const tableNums = zoneMap[zone];
      if (!tableNums) return res.status(400).json({ success: false, message: 'Zone must be 1, 2, or 3' });
      if (waiter_id) {
        const waiter = await User.findOne({ _id: waiter_id, role: 'waiter' });
        if (!waiter) return res.status(400).json({ success: false, message: 'User is not a waiter' });
      }
      const results = [];
      for (const num of tableNums) {
        const t = await RestaurantTable.findOneAndUpdate(
          { table_number: num },
          { waiter_id: waiter_id || null },
          { new: true }
        ).populate('waiter_id', 'name email');
        if (t) results.push(t);
      }
      return res.json({ success: true, data: results });
    }

    // Traditional assignments array
    if (!Array.isArray(assignments))
      return res.status(400).json({ success: false, message: 'assignments array required' });
    const results = [];
    for (const a of assignments) {
      const t = await RestaurantTable.findOneAndUpdate(
        { table_number: a.table_number },
        { waiter_id: a.waiter_id || null },
        { new: true }
      ).populate('waiter_id', 'name email');
      if (t) results.push(t);
    }
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// ── PATCH /api/tables/:id/assign-waiter-tables ───────────────────────────
// Assign/unassign multiple tables to/from a waiter at once
// Body: { table_ids: [id1, id2, ...], waiter_id: "<id>" | null }
router.patch('/assign-waiter-tables', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const { table_ids, waiter_id } = req.body;
    if (!Array.isArray(table_ids)) {
      return res.status(400).json({ success: false, message: 'table_ids array required' });
    }
    if (waiter_id) {
      const waiter = await User.findOne({ _id: waiter_id, role: 'waiter' });
      if (!waiter) return res.status(400).json({ success: false, message: 'User is not a waiter' });
    }
    const results = [];
    for (const id of table_ids) {
      const t = await RestaurantTable.findByIdAndUpdate(
        id,
        { waiter_id: waiter_id || null },
        { new: true }
      ).populate('waiter_id', 'name email');
      if (t) results.push(t);
    }
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// ── PUT /api/tables/:id  — edit a table (owner/manager only) ──────────────
router.put('/:id', protect, authorize('owner', 'manager'), async (req, res, next) => {
  try {
    const { label, capacity, type, waiter_id } = req.body;
    const table = await RestaurantTable.findById(req.params.id);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

    if (label !== undefined) {
      const trimmed = String(label).trim();
      if (!trimmed) return res.status(400).json({ success: false, message: 'Table label is required' });
      const clash = await RestaurantTable.findOne({ label: trimmed, _id: { $ne: table._id } });
      if (clash) return res.status(400).json({ success: false, message: `A table with label "${trimmed}" already exists` });
      table.label = trimmed;
    }

    if (capacity !== undefined) table.capacity = Number(capacity) || table.capacity;
    if (type) table.type = type;

    if (waiter_id !== undefined) {
      if (waiter_id) {
        const waiter = await User.findOne({ _id: waiter_id, role: 'waiter' });
        if (!waiter) return res.status(400).json({ success: false, message: 'User is not a waiter' });
        table.waiter_id = waiter_id;
      } else {
        table.waiter_id = null;
      }
    }

    await table.save();
    const updated = await RestaurantTable.findById(table._id).populate('waiter_id', 'name email');
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── DELETE /api/tables/:id ─────────────────────────────────────────────────
router.delete('/:id', protect, authorize('owner'), async (req, res, next) => {
  try {
    const table = await RestaurantTable.findByIdAndUpdate(
      req.params.id,
      { is_active: false },
      { new: true }
    );
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    res.json({ success: true, message: 'Table deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;