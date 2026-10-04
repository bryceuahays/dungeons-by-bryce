// Builds nothing; starts the built site on port 3000 with the test webhook secret, runs
// the whole test suite against it, and stops it.   npm run build && npm run test:local
import { spawn } from 'node:child_process';

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-p', '3000'], { env: { ...process.env, STRIPE_WEBHOOK_SECRET: 'whsec_localtest' }, stdio: 'ignore', shell: process.platform === 'win32' });
const up = async () => { for (let i = 0; i < 60; i++) { try { await fetch('http://localhost:3000/'); return true; } catch { await new Promise((r) => setTimeout(r, 1000)); } } return false; };
if (!(await up())) { console.error('The site did not start. Run "npm run build" first.'); server.kill(); process.exit(1); }
const tests = spawn(process.execPath, ['--test', '--test-concurrency=1', ...(process.argv.slice(2).length ? process.argv.slice(2) : ['tests/done.test.mjs', 'tests/commercial.test.mjs', 'tests/homebrew.test.mjs', 'tests/tools.test.mjs', 'tests/business.test.mjs', 'tests/followup.test.mjs', 'tests/store.test.mjs'])], { stdio: 'inherit' });
tests.on('exit', (code) => { server.kill(); process.exit(code ?? 1); });
