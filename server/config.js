require('dotenv').config();

function assertRootDir(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('ROOT_DIR is required');
  }
  return normalized;
}

const config = {
  port: Number(process.env.PORT || 9000),
  rootDir: assertRootDir(process.env.ROOT_DIR),
  maxPreviewBytes: 500_000,
  maxEditableBytes: 1_000_000,
  maxUploadBytes: 500 * 1024 * 1024,
};

module.exports = config;
