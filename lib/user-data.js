const path = require('path');
const fs = require('fs/promises');

const DATA_ROOT = path.join(__dirname, '..', 'data');

function userIdFromKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return '_default';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function getUserDataDir(apiKey) {
  const userId = userIdFromKey(apiKey);
  const dir = path.join(DATA_ROOT, userId);
  await ensureDir(dir);
  return dir;
}

function getUserFilePath(apiKey, filename) {
  const userId = userIdFromKey(apiKey);
  return path.join(DATA_ROOT, userId, filename);
}

module.exports = { userIdFromKey, getUserDataDir, getUserFilePath, ensureDir };
