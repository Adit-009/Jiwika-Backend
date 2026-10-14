const mongoose = require('mongoose');

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 36; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function generateFormattedJobId(counter) {
  const padded = String(counter).padStart(6, '0');
  return `JIV-2026-${padded}`;
}

function generateUniqueJobId() {
  const objectId = new mongoose.Types.ObjectId();
  const hex = objectId.toHexString().slice(-6).toUpperCase();
  return `JIV-2026-${hex}`;
}

function validateBase64Image(base64Str) {
  if (!base64Str || base64Str.length < 5) return;
  if (/^[\u{1F000}-\u{1FFFF}]/u.test(base64Str)) return;

  const matches = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid image format. Must be a valid Data URL.');
  }
  const mimeType = matches[1];
  const base64Data = matches[2];
  if (!mimeType.startsWith('image/')) {
    throw new Error('Invalid file type. Only images are allowed.');
  }
  const sizeInBytes = (base64Data.length * 3) / 4;
  if (sizeInBytes > 2 * 1024 * 1024) {
    throw new Error('Image is too large. Maximum size allowed is 2MB.');
  }
}

function isJobExpired(job) {
  if (job.expired || job.status === 'expired') return true;
  if (
    job.deadline &&
    job.deadline !== 'See Notice' &&
    job.deadline !== 'See Details' &&
    job.deadline !== 'See Notice/Notice Board' &&
    job.deadline !== 'See Notice Board'
  ) {
    const d = Date.parse(job.deadline);
    if (!isNaN(d)) {
      const deadlineDate = new Date(d);
      deadlineDate.setHours(23, 59, 59, 999);
      return deadlineDate < new Date();
    }
  }
  return false;
}

async function deleteExpiredJobs() {
  const Job = require('../models/Job');
  try {
    const jobs = await Job.find({
      deadline: { $exists: true, $ne: null },
      status: { $nin: ['expired', 'deleted'] },
    });

    const privateExpiredIds = [];
    const govExpiredIds = [];

    for (const job of jobs) {
      if (isJobExpired(job)) {
        if (job.jobType === 'government') {
          govExpiredIds.push(job._id);
        } else {
          privateExpiredIds.push(job._id);
        }
      }
    }

    // Delete expired private jobs
    if (privateExpiredIds.length > 0) {
      await Job.deleteMany({ _id: { $in: privateExpiredIds } });
      console.log(`Automatically removed ${privateExpiredIds.length} expired private jobs.`);
    }

    // Mark expired government jobs as 'expired' so they stay visible in Results
    if (govExpiredIds.length > 0) {
      await Job.updateMany(
        { _id: { $in: govExpiredIds } },
        { $set: { status: 'expired', expired: true } }
      );
      console.log(`Marked ${govExpiredIds.length} government jobs as expired (visible in Results).`);
    }
  } catch (err) {
    console.error('Error deleting expired jobs:', err);
  }
}

module.exports = {
  generateToken,
  generateFormattedJobId,
  generateUniqueJobId,
  validateBase64Image,
  isJobExpired,
  deleteExpiredJobs
};
