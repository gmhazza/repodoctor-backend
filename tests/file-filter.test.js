import { describe, it, expect } from 'vitest';
import { FileFilterService } from '../src/services/file-filter.service.js';
import { SKIP_REASONS } from '../src/config/constants.js';

describe('FileFilterService', () => {
  const filter = new FileFilterService({
    maxFileSize: 1024 * 1024, // 1 MB
  });

  it('accepts valid .js source file', () => {
    const res = filter.evaluate({ path: 'src/index.js', size: 1024, type: 'blob' });
    expect(res.eligible).toBe(true);
    expect(res.language).toBe('JavaScript');
  });

  it('accepts valid .py source file', () => {
    const res = filter.evaluate({ path: 'backend/main.py', size: 500, type: 'blob' });
    expect(res.eligible).toBe(true);
    expect(res.language).toBe('Python');
  });

  it('rejects image files (.png)', () => {
    const res = filter.evaluate({ path: 'assets/logo.png', size: 2048, type: 'blob' });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.IGNORED_MEDIA_OR_BINARY);
  });

  it('rejects video files (.mp4)', () => {
    const res = filter.evaluate({ path: 'media/demo.mp4', size: 50000, type: 'blob' });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.IGNORED_MEDIA_OR_BINARY);
  });

  it('rejects files inside node_modules directory', () => {
    const res = filter.evaluate({
      path: 'node_modules/express/lib/router.js',
      size: 500,
      type: 'blob',
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.IGNORED_DIRECTORY);
  });

  it('rejects files inside .git directory', () => {
    const res = filter.evaluate({ path: '.git/hooks/pre-commit', size: 200, type: 'blob' });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.IGNORED_DIRECTORY);
  });

  it('rejects sensitive .env and .env.production files', () => {
    const res1 = filter.evaluate({ path: '.env', size: 100, type: 'blob' });
    expect(res1.eligible).toBe(false);
    expect(res1.reason).toBe(SKIP_REASONS.SENSITIVE_FILE);

    const res2 = filter.evaluate({ path: 'config/.env.production', size: 100, type: 'blob' });
    expect(res2.eligible).toBe(false);
    expect(res2.reason).toBe(SKIP_REASONS.SENSITIVE_FILE);
  });

  it('rejects package-lock.json lockfile', () => {
    const res = filter.evaluate({ path: 'package-lock.json', size: 20000, type: 'blob' });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.IGNORED_LOCKFILE);
  });

  it('rejects files larger than 1 MB', () => {
    const res = filter.evaluate({
      path: 'src/huge-bundle.js',
      size: 1024 * 1024 + 10,
      type: 'blob',
    });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.FILE_TOO_LARGE);
  });

  it('accepts project configuration file package.json', () => {
    const res = filter.evaluate({ path: 'package.json', size: 800, type: 'blob' });
    expect(res.eligible).toBe(true);
    expect(res.language).toBe('Config/Project Setup');
  });

  it('accepts other valid project configs like Cargo.toml and go.mod', () => {
    const cargo = filter.evaluate({ path: 'Cargo.toml', size: 400, type: 'blob' });
    expect(cargo.eligible).toBe(true);

    const goMod = filter.evaluate({ path: 'go.mod', size: 300, type: 'blob' });
    expect(goMod.eligible).toBe(true);
  });

  it('rejects arbitrary JSON files not in allowlist', () => {
    const res = filter.evaluate({ path: 'data/random-feed.json', size: 1200, type: 'blob' });
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe(SKIP_REASONS.UNSUPPORTED_FILE_TYPE);
  });
});
