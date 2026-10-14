const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Job = require('./models/Job');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiwika';

const showcaseJobs = [
  {
    jobId: 'SHOWCASE-001',
    title: 'Senior Software Engineer',
    company: 'TechAssam Innovations',
    verified: true,
    logo: '🚀',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    location: 'Guwahati (GS Road)',
    type: 'Full-time',
    experience: '3-5 years exp',
    salary: '₹45-65k/mo',
    posted: 'Just now',
    applicationMethod: 'both',
    whatsappNumber: '919876543220',
    contactEmail: 'careers@techassam.in',
    lat: 26.1445,
    lng: 91.7362,
    coordinates: { type: 'Point', coordinates: [91.7362, 26.1445] },
    status: 'active',
    jobType: 'private',
    category: 'IT & Software',
    qualification: 'B.Tech / MCA',
    vacancies: '3',
    description: 'Develop cutting-edge web and mobile cloud applications for Northeast India enterprises using React and Node.js.',
    managementToken: 'showcase-token-001',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    publishedAt: new Date(),
  },
  {
    jobId: 'SHOWCASE-002',
    title: 'Operations & Facility Manager',
    company: 'Brahmaputra Logistics Hub',
    verified: true,
    logo: '📦',
    state: 'Assam',
    district: 'Nagaon',
    location: 'Haiborgaon',
    type: 'Full-time',
    experience: '2 years exp',
    salary: '₹28-35k/mo',
    posted: '1 hour ago',
    applicationMethod: 'whatsapp',
    whatsappNumber: '919876543221',
    lat: 26.3500,
    lng: 92.6833,
    coordinates: { type: 'Point', coordinates: [92.6833, 26.3500] },
    status: 'active',
    jobType: 'private',
    category: 'Logistics & Warehouse',
    qualification: 'Graduate',
    vacancies: '2',
    description: 'Oversee warehousing, inventory distribution, dispatch operations, and fleet coordination across Central Assam.',
    managementToken: 'showcase-token-002',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    publishedAt: new Date(),
  },
  {
    jobId: 'SHOWCASE-003',
    title: 'Guest Relations & Front Desk Manager',
    company: 'Kaziranga Eco Resort',
    verified: true,
    logo: '🏬',
    state: 'Assam',
    district: 'Golaghat',
    location: 'Kohora',
    type: 'Full-time',
    experience: '1 year exp',
    salary: '₹22-30k/mo',
    posted: '3 hours ago',
    applicationMethod: 'email',
    contactEmail: 'hr@kazirangaecoresort.com',
    lat: 26.5833,
    lng: 93.4167,
    coordinates: { type: 'Point', coordinates: [93.4167, 26.5833] },
    status: 'active',
    jobType: 'private',
    category: 'Hospitality & Tourism',
    qualification: 'Degree/Diploma in Hotel Management',
    vacancies: '1',
    description: 'Manage luxury eco-resort front desk, guest check-ins, jungle safari bookings, and guest hospitality.',
    managementToken: 'showcase-token-003',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    publishedAt: new Date(),
  },
  {
    jobId: 'SHOWCASE-004',
    title: 'Biomedical Equipment Specialist',
    company: 'Apollo Clinic Guwahati',
    verified: true,
    logo: '🏥',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    location: 'Guwahati (Dispur)',
    type: 'Full-time',
    experience: '2-4 years exp',
    salary: '₹25-35k/mo',
    posted: '4 hours ago',
    applicationMethod: 'both',
    whatsappNumber: '919876543223',
    contactEmail: 'recruitment@apolloclinicghy.in',
    lat: 26.1420,
    lng: 91.7890,
    coordinates: { type: 'Point', coordinates: [91.7890, 26.1420] },
    status: 'active',
    jobType: 'private',
    category: 'Healthcare & Medical',
    qualification: 'Diploma/B.E in Biomedical',
    vacancies: '2',
    description: 'Maintenance, calibration, and troubleshooting of diagnostic imaging equipment, analyzers, and clinical devices.',
    managementToken: 'showcase-token-004',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    publishedAt: new Date(),
  },
  {
    jobId: 'SHOWCASE-005',
    title: 'Tea Export Sales Officer',
    company: 'Assam Valley Estates & Exports',
    verified: true,
    logo: '☕',
    state: 'Assam',
    district: 'Sivasagar',
    location: 'Town Center',
    type: 'Full-time',
    experience: '3 years exp',
    salary: '₹30-40k/mo',
    posted: '5 hours ago',
    applicationMethod: 'email',
    contactEmail: 'exports@assamvalleytea.com',
    lat: 26.9838,
    lng: 94.6375,
    coordinates: { type: 'Point', coordinates: [94.6375, 26.9838] },
    status: 'active',
    jobType: 'private',
    category: 'Sales & Marketing',
    qualification: 'Graduate / MBA',
    vacancies: '1',
    description: 'Lead domestic B2B and export tea sales, manage wholesale client relationships, and coordinate auction distributions.',
    managementToken: 'showcase-token-005',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    publishedAt: new Date(),
  },
];

async function seedShowcaseJobs() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB at', MONGODB_URI);

    for (const job of showcaseJobs) {
      await Job.findOneAndUpdate(
        { jobId: job.jobId },
        job,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`Seeded job: ${job.title} at ${job.company}`);
    }

    console.log('✅ Successfully seeded 5 showcase dummy jobs into MongoDB!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding showcase jobs:', err);
    process.exit(1);
  }
}

seedShowcaseJobs();
