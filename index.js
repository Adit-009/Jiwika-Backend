require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Route imports
const jobRoutes = require('./routes/jobs');
const employerRoutes = require('./routes/employer');
const adminRoutes = require('./routes/admin');

const app = express();
const port = process.env.PORT || 3000;

// ── Middleware ──

// CORS — allow frontend origin
const allowedOrigin = process.env.APP_URL || 'http://localhost:5173';
if (!process.env.APP_URL) {
  console.warn('⚠️  APP_URL not set — CORS will only allow http://localhost:5173');
}
app.use(
  cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Parse JSON bodies (50mb limit for base64 logo uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Routes ──

app.get('/', (req, res) => {
  res.json({
    name: 'Jiwika API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      jobs: '/api/jobs',
      employer: '/api/employer',
      admin: '/api/admin',
    },
  });
});

// Mount route groups
app.use('/api/jobs', jobRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 Handler ──
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start Server ──
async function startServer() {
  try {
    await connectDB();
    app.listen(port, () => { });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();