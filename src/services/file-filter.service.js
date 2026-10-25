import path from 'path';
import {
  IGNORED_DIRECTORIES,
  SUPPORTED_SOURCE_EXTENSIONS,
  SUPPORTED_CONFIG_FILES,
  IGNORED_MEDIA_BINARY_EXTENSIONS,
  IGNORED_LOCKFILES,
  SKIP_REASONS,
  EXTENSION_TO_LANGUAGE,
} from '../config/constants.js';
import { isSensitiveFilePath } from '../utils/secret-detector.js';
import { env } from '../config/env.js';

export class FileFilterService {
  /**
   * @param {object} [options]
   * @param {string[]} [options.ignoredDirectories]
   * @param {Set<string>} [options.supportedExtensions]
   * @param {Set<string>} [options.supportedConfigFiles]
   * @param {number} [options.maxFileSize]
   */
  constructor(options = {}) {
    this.ignoredDirectories = options.ignoredDirectories || IGNORED_DIRECTORIES;
    this.supportedExtensions = options.supportedExtensions || SUPPORTED_SOURCE_EXTENSIONS;
    this.supportedConfigFiles = options.supportedConfigFiles || SUPPORTED_CONFIG_FILES;
    this.maxFileSize = options.maxFileSize || env.MAX_FILE_SIZE;
  }

  /**
   * Checks if a file path is located inside an ignored directory.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  isIgnoredDirectory(filePath) {
    if (!filePath) return false;
    const normalized = filePath.replace(/\\/g, '/');
    const segments = normalized.split('/');

    return segments.some((segment) => this.ignoredDirectories.includes(segment));
  }

  /**
   * Evaluates if a file item is eligible for AI analysis.
   *
   * @param {{ path: string, size?: number, type?: string }} file
   * @returns {{ eligible: boolean, reason?: string, language?: string }}
   */
  evaluate(file) {
    const filePath = file.path;
    const normalized = filePath.replace(/\\/g, '/');
    const baseName = path.basename(normalized);
    const ext = path.extname(baseName).toLowerCase();

    // 1. Directory check
    if (file.type === 'tree' || this.isIgnoredDirectory(normalized)) {
      return { eligible: false, reason: SKIP_REASONS.IGNORED_DIRECTORY };
    }

    // 2. Sensitive files
    if (isSensitiveFilePath(normalized)) {
      return { eligible: false, reason: SKIP_REASONS.SENSITIVE_FILE };
    }

    // 3. Lockfiles
    if (IGNORED_LOCKFILES.has(baseName)) {
      return { eligible: false, reason: SKIP_REASONS.IGNORED_LOCKFILE };
    }

    // 4. Known media or binary files
    if (IGNORED_MEDIA_BINARY_EXTENSIONS.has(ext)) {
      return { eligible: false, reason: SKIP_REASONS.IGNORED_MEDIA_OR_BINARY };
    }

    // 5. Size check
    if (typeof file.size === 'number') {
      if (file.size <= 0) {
        return { eligible: false, reason: SKIP_REASONS.EMPTY_FILE };
      }
      if (file.size > this.maxFileSize) {
        return { eligible: false, reason: SKIP_REASONS.FILE_TOO_LARGE };
      }
    }

    // 6. Project configuration files (allowed regardless of generic extension)
    if (this.supportedConfigFiles.has(baseName)) {
      return {
        eligible: true,
        language: 'Config/Project Setup',
      };
    }

    // 7. Supported programming language source files
    if (this.supportedExtensions.has(ext)) {
      return {
        eligible: true,
        language: EXTENSION_TO_LANGUAGE[ext] || 'Source Code',
      };
    }

    // 8. Otherwise, unsupported / non-source file
    return {
      eligible: false,
      reason: SKIP_REASONS.UNSUPPORTED_FILE_TYPE,
    };
  }
}

export const defaultFileFilter = new FileFilterService();
