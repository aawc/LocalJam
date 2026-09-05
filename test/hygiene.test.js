import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../');

test('Hygiene - no corporate email or internal tracking strings in repository', () => {
  const prohibitedPatterns = [
    /@google\.com/i,
    /googleplex\.com/i,
    /corp\.google\.com/i,
    /c\.googlers\.com/i,
    /TAG=agy/i,
    /CONV=[0-9a-f-]{36}/i
  ];

  const filesToCheck = [
    'package.json',
    'README.md',
    'PROMPT.md',
    'GEMINI.md',
    'CHECKLIST.md',
    'index.html',
    'manifest.webmanifest',
    'sw.js',
    'server.js',
    '.github/workflows/release.yml',
    'test/release-workflow.test.js'
  ];

  for (const relPath of filesToCheck) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    for (const pattern of prohibitedPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `File ${relPath} must not contain prohibited pattern ${pattern}`
      );
    }
  }
});

test('Hygiene - package.json specifies correct public author', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.author, 'Varun Khaneja <git.bin@khaneja.org>');
  assert.equal(pkg.license, 'MIT');
});
