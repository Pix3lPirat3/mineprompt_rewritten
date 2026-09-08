'use strict';

const packageJson = require('../../package.json');

const RELEASES_URL = 'https://github.com/Pix3lPirat3/mineprompt_rewritten/releases';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/Pix3lPirat3/mineprompt_rewritten/releases/latest';

function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u);
    if (!match) throw new Error(`Invalid release version: ${value}`);
    return { numbers: match.slice(1, 4).map(Number), prerelease: match[4]?.split('.') || [] };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.numbers.length, b.numbers.length); index += 1) {
    const difference = (a.numbers[index] || 0) - (b.numbers[index] || 0);
    if (difference) return Math.sign(difference);
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    const aNumber = /^\d+$/u.test(a.prerelease[index]);
    const bNumber = /^\d+$/u.test(b.prerelease[index]);
    if (aNumber && bNumber) return Math.sign(Number(a.prerelease[index]) - Number(b.prerelease[index]));
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return Math.sign(a.prerelease[index].localeCompare(b.prerelease[index]));
  }
  return 0;
}

async function checkForUpdate(fetchImpl = fetch) {
  const response = await fetchImpl(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `MinePrompt/${packageJson.version}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`GitHub returned status ${response.status}.`);
  const release = await response.json();
  const latestVersion = String(release.tag_name || '').replace(/^v/iu, '');
  if (!latestVersion) throw new Error('The latest GitHub release has no version tag.');
  return {
    currentVersion: packageJson.version,
    latestVersion,
    available: compareVersions(latestVersion, packageJson.version) > 0,
    url: RELEASES_URL
  };
}

module.exports = { RELEASES_URL, checkForUpdate, compareVersions };
