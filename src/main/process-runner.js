'use strict';

const { spawn } = require('node:child_process');

function terminateOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore'
    });
    killer.once('error', () => child.kill());
    killer.once('close', (code) => {
      if (code !== 0) child.kill();
    });
    return;
  }
  child.kill();
}

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const maximumOutput = Math.max(1024, Number(options.maximumOutput) || 1024 * 1024);
    let stdout = '';
    let stderr = '';
    let overflow = false;
    const append = (current, chunk) => {
      const next = current + chunk;
      if (next.length <= maximumOutput) return next;
      if (!overflow) {
        overflow = true;
        terminateOwnedProcess(child);
      }
      return next.slice(-maximumOutput);
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, String(chunk)); options.onOutput?.('stdout', String(chunk)); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, String(chunk)); options.onOutput?.('stderr', String(chunk)); });
    const timeout = Math.max(1000, Number(options.timeout) || 10 * 60 * 1000);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateOwnedProcess(child);
    }, timeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && !overflow) return resolve({ code, signal, stdout, stderr });
      const reason = timedOut ? `timed out after ${timeout}ms` : overflow ? 'produced too much output' : signal ? `was terminated by ${signal}` : `exited with code ${code}`;
      const details = stderr.trim() || stdout.trim();
      reject(new Error(`${command} ${reason}${details ? `: ${details.slice(-4000)}` : ''}`));
    });
  });
}

module.exports = { runProcess, terminateOwnedProcess };
