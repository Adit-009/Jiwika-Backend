const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    jobId: { type: String, unique: true, sparse: true },
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    verified: { type: Boolean, default: false },
    logo: { type: String, default: '🏢' },
    state: { type: String, default: 'Assam' },
    district: { type: String, default: '' },
    location: { type: String, default: '' },
    area: { type: String },
    address: { type: String },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    type: { type: String, enum: ['Full-time', 'Part-time', 'Internship'] },
    experience: { type: String },
    salary: { type: String, default: 'Negotiable' },
    posted: { type: String, default: 'Just now' },
    applicationMethod: { type: String, enum: ['whatsapp', 'email', 'both'] },
    whatsappNumber: { type: String },
    contactEmail: { type: String },
    status: {
      type: String,
      enum: ['active', 'filled', 'pending', 'rejected', 'pending_payment', 'expired', 'deleted'],
      default: 'pending',
    },
    managementToken: { type: String, required: true, unique: true, index: true },
    managementUrl: { type: String },
    paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    upiTxnId: { type: String },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    publishedAt: { type: Date },
    deletedAt: { type: Date },
    rejectedReason: { type: String },
    paused: { type: Boolean, default: false },
    expired: { type: Boolean, default: false },
    isResult: { type: Boolean, default: false },
    renewCount: { type: Number, default: 0 },
    hrName: { type: String },
    email: { type: String },
    whatsapp: { type: String },
    category: { type: String },
    qualification: { type: String },
    vacancies: { type: String },
    description: { type: String },
    benefits: { type: String },
    deadline: { type: String },
    jobType: { type: String, enum: ['private', 'government'], default: 'private' },
    officialApplyLink: { type: String },
    officialWebsite: { type: String },
    notificationPDF: { type: String },
    department: { type: String },
    ageLimit: { type: String },
    startDate: { type: String },
    selectionProcess: { type: String },
    applicationFee: { type: String },
    importantInstructions: { type: String },
    importantDates: { type: String },
  },
  { timestamps: true }
);

jobSchema.index({ coordinates: '2dsphere' });
jobSchema.index(
  { title: 'text', company: 'text', district: 'text', location: 'text', category: 'text' },
  { name: 'job_text_search' }
);
jobSchema.index({ status: 1, paused: 1, deletedAt: 1, jobType: 1 });

module.exports = mongoose.model('Job', jobSchema);
