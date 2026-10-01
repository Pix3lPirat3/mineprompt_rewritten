'use strict';

const path = require('node:path');
const minecraftFolderPath = require('minecraft-folder-path');

function authenticationCachePath() {
  const configured = process.env.MINEPROMPT_AUTH_CACHE;
  return configured && path.isAbsolute(configured)
    ? configured
    : path.join(minecraftFolderPath, 'mineprompt-cache');
}

module.exports = { authenticationCachePath };
