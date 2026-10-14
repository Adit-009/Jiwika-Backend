const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const { getLocationCoordinates } = require('../utils/geo');
const { validateBase64Image } = require('../utils/helpers');
const { sendJobNotification } = require('../utils/notifications');
const { z } = require('zod');
const validate = require('../middleware/validate');

const createJobSchema = z.discriminatedUnion('jobType', [
  z.object({
    jobType: z.literal('private'),
    title: z.string().min(1, 'title is required'),
    companyName: z.string().min(1, 'companyName is required'),
    hrName: z.string().min(1, 'hrName is required'),
    email: z.string().email('Invalid email address'),
    whatsapp: z.string().min(1, 'whatsapp is required'),
    category: z.string().min(1, 'Job Post is required'),
    salary: z.string().optional(),
    experience: z.string().min(1, 'experience is required'),
    qualification: z.string().min(1, 'qualification is required'),
    vacancies: z.union([z.string(), z.number()]).transform((val) => String(val)),
    type: z.enum(['Full-time', 'Part-time', 'Internship']),
    state: z.string().min(1, 'state is required'),
    district: z.string().min(1, 'district is required'),
    location: z.string().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
    benefits: z.string().optional(),
    deadline: z.string().optional(),
    applicationMethod: z.enum(['whatsapp', 'email', 'both']),
    applicationWhatsapp: z.string().optional(),
    applicationEmail: z.string().optional(),
  }),
  z.object({
    jobType: z.literal('government'),
    title: z.string().min(1, 'title is required'),
    companyName: z.string().min(1, 'companyName is required'),
    department: z.string().optional(),
    officialWebsite: z.string().url('Invalid website URL'),
    officialApplyLink: z.string().optional(),
    deadline: z.string().optional(),
  }),
]);

const employerGetJobSchema = z.object({
  token: z.string().min(6, 'A valid token is required'),
});

const employerUpdateJobSchema = z.object({
  token: z.string().min(6, 'A valid token is required'),
  data: createJobSchema,
});

const employerPauseSchema = z.object({
  token: z.string().min(6, 'A valid token is required'),
  paused: z.boolean({ required_error: 'paused status is required' }),
});

const employerTokenSchema = z.object({
  token: z.string().min(6, 'A valid token is required'),
});

// ── POST /api/employer/job ──
// Get job details by management token
router.post('/job', validate(employerGetJobSchema), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || token.length < 6) {
      return res.status(400).json({ error: 'A valid token is required (min 6 chars)' });
    }

    const job = await Job.findOne({ managementToken: token, deletedAt: null }).lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found or has been deleted' });
    }

    const mappedJob = {
      ...job,
      id: job._id.toString(),
    };

    res.json({ job: mappedJob });
  } catch (err) {
    console.error('Error in POST /api/employer/job:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── PUT /api/employer/job ──
// Update job by management token (resets to pending approval)
router.put('/job', validate(employerUpdateJobSchema), async (req, res) => {
  try {
    const { token, data } = req.body;

    if (!token || token.length < 6) {
      return res.status(400).json({ error: 'A valid token is required' });
    }

    const job = await Job.findOne({ managementToken: token, deletedAt: null });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const isGov = data.jobType === 'government';

    job.title = data.title;
    job.company = data.companyName;
    job.logo = job.logo || (isGov ? '🏛' : '🏢');
    job.state = isGov ? 'Assam' : data.state || '';
    job.district = isGov ? '' : data.district || '';
    job.location = isGov ? '' : data.location || '';

    if (isGov) {
      job.jobType = 'government';
      job.officialApplyLink = data.officialWebsite;
      job.officialWebsite = data.officialWebsite;
      job.department = data.department;
      job.salary = 'Explore on Official Website';
      job.qualification = 'Explore on Official Website';
      job.vacancies = 'See Notification';
      job.category = 'Government';
      job.deadline = data.deadline || 'See Notice';
      job.description = 'Explore recruitment details, notification, and schedule on the official website.';

      job.notificationPDF = undefined;
      job.ageLimit = undefined;
      job.startDate = undefined;
      job.selectionProcess = undefined;
      job.applicationFee = undefined;
      job.importantInstructions = undefined;
      job.importantDates = undefined;

      job.type = undefined;
      job.experience = undefined;
      job.applicationMethod = undefined;
      job.whatsappNumber = undefined;
      job.contactEmail = undefined;
      job.hrName = undefined;
      job.email = undefined;
      job.whatsapp = undefined;
      job.address = undefined;
      job.benefits = undefined;
    } else {
      job.jobType = 'private';
      job.type = data.type;
      job.experience = data.experience;
      job.salary = data.salary || 'Negotiable';
      job.applicationMethod = data.applicationMethod;
      job.whatsappNumber = data.applicationWhatsapp || data.whatsapp;
      job.contactEmail = data.applicationEmail || data.email;
      job.hrName = data.hrName;
      job.email = data.email;
      job.whatsapp = data.whatsapp;
      job.category = data.category;
      job.qualification = data.qualification;
      job.vacancies = data.vacancies;
      job.address = data.address;
      job.benefits = data.benefits;
      job.deadline = data.deadline;

      const coords = getLocationCoordinates(data.district || '', data.location || '');
      job.lat = coords.lat;
      job.lng = coords.lng;
      job.coordinates = {
        type: 'Point',
        coordinates: [coords.lng, coords.lat],
      };

      job.officialApplyLink = undefined;
      job.officialWebsite = undefined;
      job.notificationPDF = undefined;
      job.department = undefined;
      job.ageLimit = undefined;
      job.startDate = undefined;
      job.selectionProcess = undefined;
      job.applicationFee = undefined;
      job.importantInstructions = undefined;
      job.importantDates = undefined;
    }

    job.status = 'pending';
    job.approvalStatus = 'pending';

    await job.save();

    await sendJobNotification(job, 'updated');

    res.json({ success: true });
  } catch (err) {
    console.error('Error in PUT /api/employer/job:', err);
    res.status(500).json({ error: err.message || 'Failed to update job' });
  }
});

// ── DELETE /api/employer/job ──
// Soft-delete job by management token (updated to hard delete)
router.delete('/job', validate(employerTokenSchema), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || token.length < 6) {
      return res.status(400).json({ error: 'A valid token is required' });
    }

    const deleteResult = await Job.deleteOne({ managementToken: token });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/employer/job:', err);
    res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// ── POST /api/employer/job/pause ──
// Toggle pause/resume by management token
router.post('/job/pause', validate(employerPauseSchema), async (req, res) => {
  try {
    const { token, paused } = req.body;

    if (!token || token.length < 6) {
      return res.status(400).json({ error: 'A valid token is required' });
    }

    const job = await Job.findOne({ managementToken: token, deletedAt: null });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.paused = paused;

    await job.save();

    res.json({ success: true, paused: job.paused });
  } catch (err) {
    console.error('Error in POST /api/employer/job/pause:', err);
    res.status(500).json({ error: err.message || 'Failed to toggle pause status' });
  }
});

// ── POST /api/employer/job/renew ──
// Renew/bump job to top by management token
router.post('/job/renew', validate(employerTokenSchema), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || token.length < 6) {
      return res.status(400).json({ error: 'A valid token is required' });
    }

    const job = await Job.findOne({ managementToken: token, deletedAt: null });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.renewCount = (job.renewCount || 0) + 1;
    job.posted = 'Just now';
    job.expired = false;

    await job.save();

    res.json({ success: true, renewCount: job.renewCount });
  } catch (err) {
    console.error('Error in POST /api/employer/job/renew:', err);
    res.status(500).json({ error: err.message || 'Failed to renew job' });
  }
});

module.exports = router;
