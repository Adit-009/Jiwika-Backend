const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'system' },
    paymentsEnabled: { type: Boolean, default: false },
    upiId: { type: String, default: 'jiwika@ybl' },
    amount: { type: Number, default: 99 },
    qrCodeImage: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
