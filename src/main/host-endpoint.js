'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

function userDataPath(environment = process.env, platform = process.platform, home = os.homedir()) {
  const configured = environment.MINEPROMPT_DATA_DIR;
  if (configured && path.isAbsolute(configured)) return path.resolve(configured);
  if (platform === 'win32') return path.join(environment.APPDATA || path.join(home, 'AppData', 'Roaming'), 'mineprompt');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'mineprompt');
  return path.join(environment.XDG_CONFIG_HOME || path.join(home, '.config'), 'mineprompt');
}

function hostEndpoint(dataPath, platform = process.platform, temporaryPath = os.tmpdir()) {
  const identity = platform === 'win32' ? path.resolve(dataPath).toLowerCase() : path.resolve(dataPath);
  const hash = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
  return platform === 'win32' ? `\\\\.\\pipe\\mineprompt-${hash}` : path.join(temporaryPath, `mineprompt-${hash}.sock`);
}

function tokenPath(dataPath) {
  return path.join(dataPath, 'runtime-token');
}

module.exports = { hostEndpoint, tokenPath, userDataPath };
