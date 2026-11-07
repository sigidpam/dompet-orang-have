#!/usr/bin/env node
/**
 * Lightweight secret scanner for tracked source files.
 * Fails the build when a high-confidence credential pattern is found.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.pdf',
  '.zip',
]);

const SKIP_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const PATTERNS = [
  {
    name: 'Private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: 'AWS access key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: 'GitHub token',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: 'Stripe live secret',
    regex: /\bsk_live_[0-9A-Za-z]{20,}\b/g,
  },
  {
    name: 'Anthropic API key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'OpenAI API key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/g,
  },
  {
    name: 'JSON Web Token',
    regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
  });
  return output.split('\0').filter(Boolean);
}

const findings = [];
for (const file of trackedFiles()) {
  const extension = extname(file).toLowerCase();
  if (SKIP_EXTENSIONS.has(extension) || SKIP_FILES.has(file)) continue;
  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }
  if (!stats.isFile() || stats.size > 2 * 1024 * 1024) continue;
  const content = readFileSync(file, 'utf8');
  if (content.includes('\0')) continue;
  const lines = content.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        findings.push({
          file,
          line: lineIndex + 1,
          rule: pattern.name,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed: ${findings.length} finding(s).`);
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.rule}] ${finding.excerpt}`,
    );
  }
  process.exit(1);
}

console.log('Secret scan passed: no high-confidence credentials found.');
