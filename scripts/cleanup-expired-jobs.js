#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { deleteExpiredJobs } = require('../utils/helpers');

async function runCleanup() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] [CRON] Starting Jiwika scheduled job cleanup...`);

  try {
    await connectDB();
    const stats = await deleteExpiredJobs();
    const durationMs = Date.now() - startTime;

    if (stats && stats.skipped) {
      console.log(`[${new Date().toISOString()}] [CRON] Cleanup skipped: ${stats.reason} (${durationMs}ms)`);
    } else {
      console.log(
        `[${new Date().toISOString()}] [CRON] Cleanup finished in ${durationMs}ms. Removed private: ${stats?.deletedPrivateCount ?? 0}, Marked expired gov: ${stats?.markedGovCount ?? 0}`
      );
    }

    process.exit(0);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [CRON] Fatal cleanup error:`, err);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
}

runCleanup();
