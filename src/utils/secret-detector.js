import path from 'path';
import { SENSITIVE_FILE_NAMES, SENSITIVE_FILE_PATTERNS } from '../config/constants.js';

const SECRET_CONTENT_PATTERNS = [
  // Private Key Blocks
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,

  // AWS Access Key ID
  /\bAKIA[0-9A-Z]{16}\b/,

  // GitHub Personal Access Token / App Token
  /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/,
  /\bgithub_pat_[a-zA-Z0-9_]{82}\b/,

  // Google API Key
  /\bAIza[0-9A-Za-z\\-_]{35}\b/,

  // Slack Token
  /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/,

  // Stripe Live Secret Key
  /\bsk_live_[0-9a-zA-Z]{24,}\b/,

  // Database Connection URL with password
  /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[a-zA-Z0-9.-]+/i,
];

/**
 * Checks if a file path matches known sensitive filename patterns.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSensitiveFilePath(filePath) {
  if (!filePath) return false;

  const normalized = filePath.replace(/\\/g, '/');
  const baseName = path.basename(normalized);

  if (SENSITIVE_FILE_NAMES.has(baseName)) {
    return true;
  }

  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(baseName) || pattern.test(normalized));
}

/**
 * Scans content to check whether it contains secrets or private keys.
 * Returns true if a potential secret is detected.
 * @param {string} content
 * @returns {boolean}
 */
export function containsSecrets(content) {
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Check the first 64KB and last 64KB if file is large, or whole content
  // to maintain high throughput while catching header/config secrets
  const sample = content.length > 131072
    ? content.slice(0, 65536) + '\n' + content.slice(-65536)
    : content;

  for (const pattern of SECRET_CONTENT_PATTERNS) {
    if (pattern.test(sample)) {
      return true;
    }
  }

  return false;
}
