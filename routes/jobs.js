const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Settings = require('../models/Settings');
const { calculateDistance, getDrivingDistance, getDistance, isValidCoordinate, getLocationCoordinates } = require('../utils/geo');
const { generateToken, generateUniqueJobId, validateBase64Image, isJobExpired } = require('../utils/helpers');
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

const submitPaymentSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  token: z.string().min(1, 'token is required'),
  upiTxnId: z.string().regex(/^\d{12}$/, 'UPI Transaction ID must be a 12-digit number'),
});

// Zod schemas for validation
const nearbySchema = z.object({
  lat: z.coerce.number({ required_error: 'lat is required' }),
  lng: z.coerce.number({ required_error: 'lng is required' }),
  keyword: z.string().optional(),
  jobType: z.enum(['all', 'private', 'government']).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const everywhereSchema = z.object({
  district: z.string().optional(),
  location: z.string().optional(),
  keyword: z.string().optional(),
  jobType: z.enum(['all', 'private', 'government', 'results']).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Positive field projection: selects only public display fields,
// explicitly omitting sensitive internal fields like managementToken, upiTxnId, etc.
const PUBLIC_JOB_PROJECTION = {
  jobId: 1,
  title: 1,
  company: 1,
  verified: 1,
  logo: 1,
  state: 1,
  district: 1,
  location: 1,
  area: 1,
  address: 1,
  coordinates: 1,
  lat: 1,
  lng: 1,
  type: 1,
  experience: 1,
  salary: 1,
  posted: 1,
  applicationMethod: 1,
  whatsappNumber: 1,
  contactEmail: 1,
  status: 1,
  publishedAt: 1,
  expired: 1,
  isResult: 1,
  category: 1,
  qualification: 1,
  vacancies: 1,
  description: 1,
  benefits: 1,
  deadline: 1,
  jobType: 1,
  officialApplyLink: 1,
  officialWebsite: 1,
  notificationPDF: 1,
  department: 1,
  ageLimit: 1,
  startDate: 1,
  selectionProcess: 1,
  applicationFee: 1,
  importantInstructions: 1,
  importantDates: 1,
  createdAt: 1,
  updatedAt: 1,
};

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

// ── POST /api/jobs/nearby ──
// Search jobs within 100km radius of given coordinates with pagination & projection
router.post('/nearby', validate(nearbySchema), async (req, res) => {
  try {
    const { lat, lng, keyword, jobType, page, limit } = req.body;

    const userLat = Number(lat);
    const userLng = Number(lng);

    if (!isValidCoordinate(userLat, userLng)) {
      return res.status(400).json({ error: 'Valid user latitude and longitude are required' });
    }

    const skip = (page - 1) * limit;

    // Build query filter with geospatial index querying
    const filter = {
      status: 'active',
      paused: { $ne: true },
      deletedAt: null,
      jobType: { $ne: 'government' }, // Nearby mode excludes government jobs
      coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [userLng, userLat],
          },
          $maxDistance: 100000, // 100km in meters
        },
      },
    };

    // Optional jobType filter (but never government in nearby mode)
    if (jobType && jobType !== 'all') {
      filter.jobType = jobType;
    }

    // Keyword filter directly in MongoDB (indexed/optimized)
    if (keyword) {
      const kwRegex = new RegExp(keyword, 'i');
      filter.$or = [
        { title: kwRegex },
        { company: kwRegex },
        { district: kwRegex },
        { location: kwRegex },
        { category: kwRegex },
      ];
    }

    // Efficient count for geospatial query using $geoWithin
    let total = 0;
    try {
      const countFilter = {
        ...filter,
        coordinates: {
          $geoWithin: {
            $centerSphere: [[userLng, userLat], 100 / 6378.1],
          },
        },
      };
      total = await Job.countDocuments(countFilter);
    } catch (e) {
      console.warn('Geospatial count query failed:', e.message);
    }

    let jobs = [];
    if (total > 0) {
      try {
        jobs = await Job.find(filter)
          .select(PUBLIC_JOB_PROJECTION)
          .skip(skip)
          .limit(limit)
          .lean();
      } catch (e) {
        console.warn('Geospatial $near query failed:', e.message);
      }
    }

    // Fallback: If no jobs found within 100km (e.g. user location is outside Assam or > 100km away),
    // query active jobs so the UI ALWAYS showcases available jobs sorted by proximity!
    if (!jobs || jobs.length === 0) {
      const fallbackFilter = {
        status: 'active',
        paused: { $ne: true },
        deletedAt: null,
        jobType: { $ne: 'government' },
      };
      if (jobType && jobType !== 'all') {
        fallbackFilter.jobType = jobType;
      }
      if (keyword) {
        const kwRegex = new RegExp(keyword, 'i');
        fallbackFilter.$or = [
          { title: kwRegex },
          { company: kwRegex },
          { district: kwRegex },
          { location: kwRegex },
          { category: kwRegex },
        ];
      }

      total = await Job.countDocuments(fallbackFilter);
      jobs = await Job.find(fallbackFilter)
        .select(PUBLIC_JOB_PROJECTION)
        .skip(skip)
        .limit(limit)
        .lean();
    }

    // Filter expired jobs in memory to guarantee no uncleaned expired jobs slip through
    jobs = jobs.filter((j) => !isJobExpired(j));

    // Map response with driving road distance, latitude, longitude, and id formatting
    // Calculated only on the paginated slice to minimize latency
    const mappedJobs = await Promise.all(
      jobs.map(async (j) => {
        let jobLat = j.lat;
        let jobLng = j.lng;

        // Auto-geocode missing or invalid coordinates using district/location map
        if (!isValidCoordinate(jobLat, jobLng) && j.district) {
          const coords = getLocationCoordinates(j.district, j.location);
          jobLat = coords.lat;
          jobLng = coords.lng;
        }

        const dist = await getDrivingDistance(userLat, userLng, jobLat, jobLng);

        return {
          ...j,
          id: j._id.toString(),
          lat: isValidCoordinate(jobLat, jobLng) ? Number(jobLat) : null,
          lng: isValidCoordinate(jobLat, jobLng) ? Number(jobLng) : null,
          latitude: isValidCoordinate(jobLat, jobLng) ? Number(jobLat) : null,
          longitude: isValidCoordinate(jobLat, jobLng) ? Number(jobLng) : null,
          distance: dist,
        };
      })
    );

    // Sort nearest first
    mappedJobs.sort((a, b) => {
      if (a.distance === null || a.distance === undefined) return 1;
      if (b.distance === null || b.distance === undefined) return -1;
      return a.distance - b.distance;
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      jobs: mappedJobs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    console.error('Error in /api/jobs/nearby:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/jobs/everywhere ──
// Get all jobs matching criteria with pagination and field projection
router.post('/everywhere', validate(everywhereSchema), async (req, res) => {
  try {
    const { district, location, keyword, jobType, page, limit } = req.body;

    const skip = (page - 1) * limit;

    // Build base filter
    const filter = {
      status: 'active',
      paused: { $ne: true },
      deletedAt: null,
    };

    // District filter
    if (district) filter.district = district;

    // Location filter
    if (location) filter.location = location;

    // For "results" mode, we want expired government jobs
    if (jobType === 'results') {
      filter.jobType = 'government';
      filter.status = 'expired';
      delete filter.paused;
    } else if (jobType && jobType !== 'all') {
      filter.jobType = jobType;
    }

    // Keyword filter directly in MongoDB (indexed/optimized)
    if (keyword) {
      const kwRegex = new RegExp(keyword, 'i');
      filter.$or = [
        { title: kwRegex },
        { company: kwRegex },
        { district: kwRegex },
        { location: kwRegex },
        { category: kwRegex },
      ];
    }

    // Efficient total count directly from database
    const total = await Job.countDocuments(filter);

    // Fetch paginated jobs in MongoDB with field projection and sort
    let jobs = await Job.find(filter)
      .select(PUBLIC_JOB_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Apply expiry filtering based on jobType
    if (jobType === 'results') {
      // Already filtered by status: 'expired' in the DB query — no client-side filter needed
      jobs = jobs.filter((j) => !j.deletedAt);
    } else {
      jobs = jobs.filter((j) => !isJobExpired(j));
    }

    // Map _id to id and expose latitude and longitude
    const mappedJobs = jobs.map((j) => {
      const valid = isValidCoordinate(j.lat, j.lng);
      return {
        ...j,
        id: j._id.toString(),
        lat: valid ? Number(j.lat) : null,
        lng: valid ? Number(j.lng) : null,
        latitude: valid ? Number(j.lat) : null,
        longitude: valid ? Number(j.lng) : null,
      };
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      jobs: mappedJobs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    console.error('Error in /api/jobs/everywhere:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── POST /api/jobs ──
// Create a new job posting (private or government)
router.post('/', validate(createJobSchema), async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.title || !data.companyName) {
      return res.status(400).json({ error: 'title and companyName are required' });
    }

    const token = generateToken();
    const jobId = generateUniqueJobId();
    const isGov = data.jobType === 'government';

    const settings = await getSystemSettings();
    const paymentsRequired = settings.paymentsEnabled && !isGov;

    // Get coordinates for private jobs
    let lat = 26.2006;
    let lng = 92.9376;

    if (!isGov && data.district) {
      const coords = getLocationCoordinates(data.district || '', data.location || '');
      lat = coords.lat;
      lng = coords.lng;
    }

    const newJob = new Job({
      jobId,
      title: data.title,
      company: data.companyName,
      verified: isGov ? true : false,
      logo: isGov ? '🏛' : '🏢',
      state: isGov ? 'Assam' : data.state || '',
      district: isGov ? '' : data.district || '',
      location: isGov ? '' : data.location || '',
      type: isGov ? undefined : data.type,
      experience: isGov ? undefined : data.experience,
      salary: isGov ? 'Explore on Official Website' : data.salary || 'Negotiable',
      posted: 'Just now',
      applicationMethod: isGov ? undefined : data.applicationMethod,
      whatsappNumber: isGov ? undefined : data.applicationWhatsapp || data.whatsapp,
      contactEmail: isGov ? undefined : data.applicationEmail || data.email,
      lat,
      lng,
      coordinates: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      status: paymentsRequired ? 'pending_payment' : 'pending',
      managementToken: token,
      managementUrl: `/manage/${token}`,
      paymentStatus: paymentsRequired ? 'pending' : 'paid',
      approvalStatus: 'pending',
      hrName: isGov ? undefined : data.hrName,
      email: isGov ? undefined : data.email,
      whatsapp: isGov ? undefined : data.whatsapp,
      category: isGov ? 'Government' : data.category,
      qualification: isGov ? 'Explore on Official Website' : data.qualification,
      vacancies: isGov ? 'See Notification' : data.vacancies,
      address: isGov ? undefined : data.address,
      benefits: isGov ? undefined : data.benefits,
      deadline: data.deadline || (isGov ? 'See Notice' : undefined),
      renewCount: 0,
      paused: false,
      expired: false,
      jobType: data.jobType || 'private',
      officialApplyLink: isGov ? data.officialWebsite : undefined,
      officialWebsite: isGov ? data.officialWebsite : undefined,
      department: isGov ? data.department : undefined,
      description: isGov
        ? 'Explore recruitment details, notification, and schedule on the official website.'
        : data.description || '',
    });

    await newJob.save();

    await sendJobNotification(newJob, 'created');

    const redirectUrl = `/payment-success?jobId=${jobId}&token=${token}&paymentRequired=${paymentsRequired ? 'true' : 'false'}`;

    res.status(201).json({
      jobId,
      managementToken: token,
      redirectUrl,
    });
  } catch (err) {
    console.error('Error in POST /api/jobs:', err);
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// ── GET /api/jobs/payment-setting ──
router.get('/payment-setting', async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      paymentsEnabled: settings.paymentsEnabled,
      upiId: settings.upiId,
      amount: settings.amount,
      qrCodeImage: settings.qrCodeImage,
    });
  } catch (err) {
    console.error('Error in GET /api/jobs/payment-setting:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch payment settings' });
  }
});

// ── POST /api/jobs/submit-payment ──
router.post('/submit-payment', validate(submitPaymentSchema), async (req, res) => {
  try {
    const { jobId, token, upiTxnId } = req.body;

    const job = await Job.findOne({ jobId, managementToken: token });
    if (!job) {
      return res.status(404).json({ error: 'Job listing not found or unauthorized' });
    }

    if (job.status !== 'pending_payment') {
      return res.status(400).json({ error: 'Job listing is not pending payment' });
    }

    job.upiTxnId = upiTxnId;
    job.status = 'pending';
    await job.save();

    res.json({ success: true, message: 'Payment reference submitted successfully.' });
  } catch (err) {
    console.error('Error in POST /api/jobs/submit-payment:', err);
    res.status(500).json({ error: err.message || 'Failed to submit payment reference' });
  }
});

module.exports = router;
