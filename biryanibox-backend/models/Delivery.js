const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema({
  order_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  driver_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Customer info captured at checkout
  customer_name:     { type: String },
  customer_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_email:    { type: String },
  phone:             { type: String },
  delivery_address:  { type: String, required: true },
  delivery_notes:    { type: String },
  knock_bell:        { type: Boolean, default: true },

  // Lifecycle:
  // pending    → waiting for a rider to accept
  // assigned   → rider accepted, not yet picked up
  // picked_up  → rider has the food
  // in_transit → on the way to customer
  // delivered  → food delivered, awaiting payment collection
  // paid       → payment collected, order fully complete
  // failed     → could not deliver
  status: {
    type: String,
    enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'paid', 'failed'],
    default: 'pending',
  },

  // Riders who rejected this delivery (hide from them next time)
  rejected_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Logistics
  distance_km:       { type: Number, min: 0 },
  estimated_mins:    { type: Number, min: 0 },
  current_location:  { type: String },
  // Live rider position — written by PATCH /api/deliveries/:id/location
  rider_lat:         { type: Number },
  rider_lng:         { type: Number },
  last_location_at:  { type: Date },
  delivery_fee:      { type: Number, default: 40 },

  // Waiter dispatch flag — rider cannot pickup until waiter marks dispatched
  waiter_dispatched:{ type: Boolean, default: false },
  dispatched_at:     { type: Date, default: null },
  dispatched_by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Timestamps
  order_placed_at:   { type: Date, default: Date.now },
  accepted_at:       { type: Date },
  assigned_at:       { type: Date },
  picked_up_at:      { type: Date },
  in_transit_at:     { type: Date },
  delivered_at:      { type: Date },
  paid_at:           { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Delivery', DeliverySchema);