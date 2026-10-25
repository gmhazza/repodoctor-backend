import { describe, it, expect } from 'vitest';
import { parseGitHubUrl, validateRepositoryUrl } from '../src/utils/validation.js';
import { containsSecrets, isSensitiveFilePath } from '../src/utils/secret-detector.js';

describe('Validation Utility', () => {
  it('parses standard HTTPS GitHub repository URL', () => {
    const res = parseGitHubUrl('https://github.com/facebook/react');
    expect(res).toEqual({ owner: 'facebook', repo: 'react' });
  });

  it('parses URL with .git extension and trailing slash', () => {
    const res = parseGitHubUrl('https://github.com/expressjs/express.git/');
    expect(res).toEqual({ owner: 'expressjs', repo: 'express' });
  });

  it('parses URL without scheme', () => {
    const res = parseGitHubUrl('github.com/owner/my-repo');
    expect(res).toEqual({ owner: 'owner', repo: 'my-repo' });
  });

  it('returns null for non-github URLs or invalid formats', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGitHubUrl('invalid-url')).toBeNull();
    expect(parseGitHubUrl('https://github.com/onlyowner')).toBeNull();
  });

  it('throws structured error in validateRepositoryUrl for bad inputs', () => {
    expect(() => validateRepositoryUrl('')).toThrow(/required/);
    expect(() => validateRepositoryUrl('https://bitbucket.org/a/b')).toThrow(/Invalid GitHub repository/);
  });
});

describe('Secret Detector Utility', () => {
  it('identifies sensitive file paths', () => {
    expect(isSensitiveFilePath('.env')).toBe(true);
    expect(isSensitiveFilePath('.env.local')).toBe(true);
    expect(isSensitiveFilePath('secrets/server.key')).toBe(true);
    expect(isSensitiveFilePath('certs/cert.pem')).toBe(true);
    expect(isSensitiveFilePath('config/credentials.json')).toBe(true);
    expect(isSensitiveFilePath('service-account.json')).toBe(true);
    expect(isSensitiveFilePath('src/app.js')).toBe(false);
  });

  it('detects AWS secrets in content', () => {
    const code = 'const awsKey = "AKIA1234567890ABCDEF";';
    expect(containsSecrets(code)).toBe(true);
  });

  it('detects GitHub token in content', () => {
    const code = 'const token = "ghp_123456789012345678901234567890123456";';
    expect(containsSecrets(code)).toBe(true);
  });

  it('detects private key blocks in content', () => {
    const code = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    expect(containsSecrets(code)).toBe(true);
  });

  it('returns false for normal clean code', () => {
    const code = `
      function hello(name) {
        return "Hello " + name;
      }
      export default hello;
    `;
    expect(containsSecrets(code)).toBe(false);
  });
});
