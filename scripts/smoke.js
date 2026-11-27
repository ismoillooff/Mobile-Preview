'use strict';

// Launches the app in smoke-test mode, waits for it to capture itself, and prints the report.
// Usage: node scripts/smoke.js [outDir] [url]
// Optional env: MP_SMOKE_STATE (JSON settings override), MP_SMOKE_DELAY (ms), MP_SMOKE_JS (host eval).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', '.smoke'));
const url = process.argv[3] || '';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const child = spawn(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env: { ...process.env, MP_SMOKE: outDir, MP_SMOKE_URL: url },
});

child.on('exit', (code) => {
  const reportPath = path.join(outDir, 'report.json');
  if (!fs.existsSync(reportPath)) {
    console.error(`smoke: no report (exit ${code})`);
    process.exit(1);
  }
  console.log(fs.readFileSync(reportPath, 'utf8'));
  console.log(`smoke: screenshots in ${outDir}`);
});
