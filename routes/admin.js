const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Settings = require('../models/Settings');
const adminAuth = require('../middleware/adminAuth');
const { isJobExpired, deleteExpiredJobs, generateToken, generateUniqueJobId } = require('../utils/helpers');
const { sendJobNotification } = require('../utils/notifications');
const { z } = require('zod');
const validate = require('../middleware/validate');

async function getSystemSettings() {
  let settings = await Settings.findOne({ key: 'system' });
  if (!settings) {
    settings = new Settings({ key: 'system' });
    await settings.save();
  }
  return settings;
}

const adminSettingsSchema = z.object({
  password: z.string().min(1, 'password is required'),
});

const adminSettingsUpdateSchema = z.object({
  password: z.string().min(1, 'password is required'),
  paymentsEnabled: z.boolean({ required_error: 'paymentsEnabled status is required' }),
  upiId: z.string().min(1, 'upiId is required'),
  amount: z.coerce.number().min(0, 'amount must be a positive number'),
  qrCodeImage: z.string().optional(),
});

// Validator schemas
const adminJobsSchema = z.object({
  password: z.string().min(1, 'password is required'),
  statusFilter: z.enum(['all', 'pending_payment', 'pending', 'active', 'rejected', 'expired', 'deleted', 'post_results']).optional().default('all'),
  searchQuery: z.string().optional(),
});

const adminActionSchema = z.object({
  password: z.string().min(1, 'password is required'),
  jobId: z.string().min(1, 'jobId is required'),
});

const adminRejectSchema = z.object({
  password: z.string().min(1, 'password is required'),
  jobId: z.string().min(1, 'jobId is required'),
  reason: z.string().optional(),
});

const adminPauseSchema = z.object({
  password: z.string().min(1, 'password is required'),
  jobId: z.string().min(1, 'jobId is required'),
  paused: z.boolean({ required_error: 'paused status is required' }),
});

const adminPostResultSchema = z.object({
  password: z.string().min(1, 'password is required'),
  title: z.string().min(1, 'title is required'),
  companyName: z.string().min(1, 'organization name is required'),
  department: z.string().optional(),
  officialWebsite: z.string().min(1, 'official website URL is required'),
  deadline: z.string().optional(),
});

const adminEditResultSchema = z.object({
  password: z.string().min(1, 'password is required'),
  jobId: z.string().min(1, 'jobId is required'),
  title: z.string().min(1, 'title is required'),
  companyName: z.string().min(1, 'organization name is required'),
  department: z.string().optional(),
  officialWebsite: z.string().min(1, 'official website URL is required'),
  deadline: z.string().optional(),
});

// Helper to find a job by jobId or MongoDB _id
async function findJobByIdOrJobId(jobId) {
  if (!jobId) return null;
  // Try by jobId field first, then by _id if it looks like an ObjectId
  let job = await Job.findOne({ jobId });
  if (!job && jobId.match(/^[0-9a-fA-F]{24}$/)) {
    job = await Job.findById(jobId);
  }
  return job;
}

// ── POST /api/admin/jobs ──
// Get all jobs with status filter and search query
router.post('/jobs', validate(adminJobsSchema), adminAuth, async (req, res) => {
  try {
    await deleteExpiredJobs();
    const { statusFilter = 'all', searchQuery } = req.body;

    let filter = {};

    // Migrate old posted results to have isResult: true
    await Job.updateMany(
      {
        jobType: 'government',
        status: 'expired',
        isResult: { $ne: true },
        description: /merit list/i
      },
      { $set: { isResult: true } }
    );

    if (statusFilter !== 'all') {
      if (statusFilter === 'deleted') {
        filter.deletedAt = { $ne: null };
      } else if (statusFilter === 'active') {
        filter.status = 'active';
        filter.deletedAt = null;
        filter.expired = { $ne: true };
      } else if (statusFilter === 'post_results') {
        filter.isResult = true;
        filter.deletedAt = null;
      } else if (statusFilter === 'expired') {
        filter.$or = [{ status: 'expired' }, { expired: true }];
        filter.isResult = { $ne: true };
        filter.deletedAt = null;
      } else {
        filter.status = statusFilter;
        filter.deletedAt = null;
      }
    }

    let jobs = await Job.find(filter).sort({ updatedAt: -1 }).lean();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      jobs = jobs.filter(
        (j) =>
          (j.jobId && j.jobId.toLowerCase().includes(q)) ||
          (j._id && j._id.toString().toLowerCase().includes(q)) ||
          (j.company && j.company.toLowerCase().includes(q)) ||
          (j.whatsappNumber && j.whatsappNumber.toLowerCase().includes(q)) ||
          (j.whatsapp && j.whatsapp.toLowerCase().includes(q)) ||
          (j.district && j.district.toLowerCase().includes(q)) ||
          (j.jobType && j.jobType.toLowerCase().includes(q))
      );
    }

    const mappedJobs = jobs.map((j) => ({
      ...j,
      id: j._id.toString(),
    }));

    res.json({ jobs: mappedJobs });
  } catch (err) {
    console.error('Error in POST /api/admin/jobs:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/admin/verify-payment ──
router.post('/verify-payment', validate(adminActionSchema), adminAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.paymentStatus = 'paid';
    job.approvalStatus = 'pending';
    job.status = 'pending';
    await job.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/verify-payment:', err);
    res.status(500).json({ error: err.message || 'Failed to verify payment' });
  }
});

// ── POST /api/admin/approve ──
router.post('/approve', validate(adminActionSchema), adminAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.status = 'active';
    job.approvalStatus = 'approved';
    job.paymentStatus = 'paid';
    job.publishedAt = new Date();
    job.posted = 'Just now';
    await job.save();

    await sendJobNotification(job, 'approved');

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/approve:', err);
    res.status(500).json({ error: err.message || 'Failed to approve job' });
  }
});

// ── POST /api/admin/reject ──
router.post('/reject', validate(adminRejectSchema), adminAuth, async (req, res) => {
  try {
    const { jobId, reason } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.status = 'rejected';
    job.approvalStatus = 'rejected';
    job.rejectedReason = reason || 'Does not comply with posting guidelines';
    await job.save();

    await sendJobNotification(job, 'rejected');

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/reject:', err);
    res.status(500).json({ error: err.message || 'Failed to reject job' });
  }
});

// ── POST /api/admin/pause ──
router.post('/pause', validate(adminPauseSchema), adminAuth, async (req, res) => {
  try {
    const { jobId, paused } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.paused = paused;
    await job.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/pause:', err);
    res.status(500).json({ error: err.message || 'Failed to pause/resume job' });
  }
});

// ── POST /api/admin/expire ──
router.post('/expire', validate(adminActionSchema), adminAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.expired = true;
    job.status = 'expired';
    await job.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/expire:', err);
    res.status(500).json({ error: err.message || 'Failed to expire job' });
  }
});

// ── POST /api/admin/restore ──
router.post('/restore', validate(adminActionSchema), adminAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.deletedAt = undefined;
    job.expired = false;
    job.paused = false;

    if (job.paymentStatus === 'paid') {
      job.status = 'active';
      job.approvalStatus = 'approved';
      job.posted = 'Just now';
    } else {
      job.status = 'pending_payment';
      job.approvalStatus = 'pending';
    }
    await job.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/restore:', err);
    res.status(500).json({ error: err.message || 'Failed to restore job' });
  }
});

// ── POST /api/admin/delete ──
router.post('/delete', validate(adminActionSchema), adminAuth, async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await Job.deleteOne({ _id: job._id });

    res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/admin/delete:', err);
    res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// ── POST /api/admin/post-result ──
// Create a government job result entry directly with status 'expired'
router.post('/post-result', validate(adminPostResultSchema), adminAuth, async (req, res) => {
  try {
    const { title, companyName, department, officialWebsite, deadline } = req.body;

    const token = generateToken();
    const jobId = generateUniqueJobId();

    const newJob = new Job({
      jobId,
      title,
      company: companyName,
      verified: true,
      logo: '🏛',
      state: 'Assam',
      district: '',
      location: '',
      salary: 'Explore on Official Website',
      posted: 'Just now',
      lat: 26.2006,
      lng: 92.9376,
      coordinates: {
        type: 'Point',
        coordinates: [92.9376, 26.2006],
      },
      status: 'expired',
      expired: true,
      isResult: true,
      managementToken: token,
      managementUrl: `/manage/${token}`,
      paymentStatus: 'paid',
      approvalStatus: 'approved',
      publishedAt: new Date(),
      category: 'Government',
      qualification: 'Explore on Official Website',
      vacancies: 'See Notification',
      deadline: deadline || 'See Notice',
      renewCount: 0,
      paused: false,
      jobType: 'government',
      officialApplyLink: officialWebsite,
      officialWebsite: officialWebsite,
      department: department || undefined,
      description: 'Results are out. Check the official website for merit list, cut-off marks, and further instructions.',
    });

    await newJob.save();

    res.status(201).json({
      success: true,
      jobId,
      message: 'Result posted successfully. It will appear in the Results section.',
    });
  } catch (err) {
    console.error('Error in POST /api/admin/post-result:', err);
    res.status(500).json({ error: err.message || 'Failed to post result' });
  }
});

// ── POST /api/admin/edit-result ──
router.post('/edit-result', validate(adminEditResultSchema), adminAuth, async (req, res) => {
  try {
    const { jobId, title, companyName, department, officialWebsite, deadline } = req.body;

    const job = await findJobByIdOrJobId(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.title = title;
    job.company = companyName;
    job.department = department || undefined;
    job.officialApplyLink = officialWebsite;
    job.officialWebsite = officialWebsite;
    if (deadline) {
      job.deadline = deadline;
    }
    job.isResult = true;

    await job.save();

    res.json({
      success: true,
      message: 'Result updated successfully.',
    });
  } catch (err) {
    console.error('Error in POST /api/admin/edit-result:', err);
    res.status(500).json({ error: err.message || 'Failed to edit result' });
  }
});

// ── POST /api/admin/get-settings ──
router.post('/get-settings', validate(adminSettingsSchema), adminAuth, async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({ settings });
  } catch (err) {
    console.error('Error in POST /api/admin/get-settings:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch settings' });
  }
});

// ── POST /api/admin/update-settings ──
router.post('/update-settings', validate(adminSettingsUpdateSchema), adminAuth, async (req, res) => {
  try {
    const { paymentsEnabled, upiId, amount, qrCodeImage } = req.body;
    const settings = await getSystemSettings();

    settings.paymentsEnabled = paymentsEnabled;
    if (upiId) settings.upiId = upiId;
    if (amount !== undefined) settings.amount = amount;
    if (qrCodeImage !== undefined) settings.qrCodeImage = qrCodeImage;

    await settings.save();
    res.json({ success: true, settings });
  } catch (err) {
    console.error('Error in POST /api/admin/update-settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

module.exports = router;
