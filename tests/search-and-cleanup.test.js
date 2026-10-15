const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Job = require('../models/Job');
const Settings = require('../models/Settings');
const { isJobExpired, deleteExpiredJobs } = require('../utils/helpers');
const jobRoutes = require('../routes/jobs');

// Create test Express application
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/jobs', jobRoutes);
  return app;
}

// In-memory / HTTP request helper using Node built-in fetch
async function makePostRequest(app, path, body) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, body: data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Fix 1 & Fix 2: Search, Pagination, Projection, and Cleanup Tests', async () => {
  let app;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
    app = createTestApp();
  });

  after(async () => {
    // Clean up test lock
    await Settings.deleteOne({ key: 'job_cleanup_lock' });
    await mongoose.disconnect();
  });

  // ── 1. Unit Tests for Expiry Rules ──
  describe('Expiry Handling Rules', () => {
    test('isJobExpired correctly flags past date deadlines', () => {
      const pastJob = { deadline: '2020-01-01', status: 'active' };
      assert.strictEqual(isJobExpired(pastJob), true);
    });

    test('isJobExpired keeps future date deadlines active', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureJob = { deadline: futureDate.toISOString().split('T')[0], status: 'active' };
      assert.strictEqual(isJobExpired(futureJob), false);
    });

    test('isJobExpired respects special non-date deadlines', () => {
      assert.strictEqual(isJobExpired({ deadline: 'See Notice', status: 'active' }), false);
      assert.strictEqual(isJobExpired({ deadline: 'See Details', status: 'active' }), false);
      assert.strictEqual(isJobExpired({ deadline: 'See Notice/Notice Board', status: 'active' }), false);
      assert.strictEqual(isJobExpired({ deadline: 'See Notice Board', status: 'active' }), false);
    });

    test('isJobExpired flags status="expired" or expired=true', () => {
      assert.strictEqual(isJobExpired({ status: 'expired' }), true);
      assert.strictEqual(isJobExpired({ expired: true }), true);
    });
  });

  // ── 2. Pagination Boundaries and Validation ──
  describe('Pagination Validation & Metadata (/api/jobs/everywhere)', () => {
    test('defaults to page 1 and limit 20 when parameters are omitted', async () => {
      const res = await makePostRequest(app, '/api/jobs/everywhere', { jobType: 'all' });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.jobs));
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 20);
      assert.ok(typeof res.body.pagination.total === 'number');
      assert.ok(typeof res.body.pagination.totalPages === 'number');
      assert.ok(typeof res.body.pagination.hasMore === 'boolean');
    });

    test('accepts custom page and limit within boundaries', async () => {
      const res = await makePostRequest(app, '/api/jobs/everywhere', {
        jobType: 'all',
        page: 1,
        limit: 2,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.ok(res.body.jobs.length <= 2);
    });

    test('rejects limit exceeding maximum (100) with 400 Bad Request', async () => {
      const res = await makePostRequest(app, '/api/jobs/everywhere', {
        page: 1,
        limit: 101,
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error);
    });

    test('rejects zero or negative page with 400 Bad Request', async () => {
      const resZero = await makePostRequest(app, '/api/jobs/everywhere', { page: 0, limit: 20 });
      assert.strictEqual(resZero.status, 400);

      const resNeg = await makePostRequest(app, '/api/jobs/everywhere', { page: -1, limit: 20 });
      assert.strictEqual(resNeg.status, 400);
    });

    test('rejects zero or negative limit with 400 Bad Request', async () => {
      const resZero = await makePostRequest(app, '/api/jobs/everywhere', { page: 1, limit: 0 });
      assert.strictEqual(resZero.status, 400);

      const resNeg = await makePostRequest(app, '/api/jobs/everywhere', { page: 1, limit: -5 });
      assert.strictEqual(resNeg.status, 400);
    });
  });

  // ── 3. Field Projection & Security (No Management Token Exposure) ──
  describe('Field Projection and Response Compatibility', () => {
    test('public search returns required frontend fields and EXCLUDES sensitive managementToken', async () => {
      const res = await makePostRequest(app, '/api/jobs/everywhere', { page: 1, limit: 10 });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.jobs.length > 0, 'Should return active jobs');

      for (const job of res.body.jobs) {
        // Public display fields exist
        assert.ok(job.id, 'job.id must be present for React key');
        assert.ok(job.title, 'job.title must be present');
        assert.ok(job.company, 'job.company must be present');
        assert.strictEqual(typeof job.status, 'string');

        // Sensitive fields are projected out
        assert.strictEqual(job.managementToken, undefined, 'managementToken MUST NEVER be exposed in public search results');
        assert.strictEqual(job.upiTxnId, undefined, 'upiTxnId MUST NEVER be exposed in public search results');
        assert.strictEqual(job.deletedAt, undefined, 'deletedAt MUST NOT be exposed in public search results');
      }
    });

    test('/api/jobs/nearby returns pagination and excludes managementToken', async () => {
      const res = await makePostRequest(app, '/api/jobs/nearby', {
        lat: 26.1445,
        lng: 91.7362,
        page: 1,
        limit: 5,
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.jobs));
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.limit, 5);

      for (const job of res.body.jobs) {
        assert.strictEqual(job.managementToken, undefined);
        assert.strictEqual(job.upiTxnId, undefined);
        assert.ok('distance' in job);
      }
    });
  });

  // ── 4. Distributed Lock Safety for Cleanup ──
  describe('Cleanup Distributed Locking and Concurrency Control', () => {
    test('deleteExpiredJobs acquires lock, runs, releases lock, and returns stats', async () => {
      const result = await deleteExpiredJobs();
      assert.ok(result.success, 'Cleanup should succeed');
      assert.ok(typeof result.deletedPrivateCount === 'number');
      assert.ok(typeof result.markedGovCount === 'number');

      // Verify lock document exists and is released
      const lockDoc = await Settings.findOne({ key: 'job_cleanup_lock' });
      assert.ok(lockDoc);
      assert.strictEqual(lockDoc.locked, false, 'Lock should be released after execution');
    });

    test('prevents concurrent cleanup runs when lock is active', async () => {
      // Simulate another instance holding the lock
      const future = new Date(Date.now() + 60000);
      await Settings.findOneAndUpdate(
        { key: 'job_cleanup_lock' },
        { $set: { locked: true, lockedAt: new Date(), lockedUntil: future, lockedBy: 'foreign_instance_999' } },
        { upsert: true }
      );

      // Attempt to run cleanup
      const result = await deleteExpiredJobs();
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.reason, 'locked');

      // Release simulated lock
      await Settings.findOneAndUpdate(
        { key: 'job_cleanup_lock' },
        { $set: { locked: false, lockedUntil: new Date(0) } }
      );
    });
  });
});
