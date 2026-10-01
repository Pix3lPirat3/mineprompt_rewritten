'use strict';

const packageJson = require('../../package.json');

const RELEASES_URL = 'https://github.com/Pix3lPirat3/mineprompt_rewritten/releases';
const RELEASES_API_URL = 'https://api.github.com/repos/Pix3lPirat3/mineprompt_rewritten/releases?per_page=20';

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

function releaseVersion(release) {
  if (!release || release.draft) return null;
  const version = String(release.tag_name || '').replace(/^v/iu, '');
  try {
    compareVersions(version, version);
    return version;
  } catch {
    return null;
  }
}

async function checkForUpdate(fetchImpl = fetch, currentVersion = packageJson.version) {
  const response = await fetchImpl(RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `MinePrompt/${packageJson.version}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`GitHub returned status ${response.status}.`);
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error('GitHub returned invalid release metadata.');
  const includePrereleases = currentVersion.includes('-');
  const candidates = releases
    .map((release) => ({ release, version: releaseVersion(release) }))
    .filter((candidate) => candidate.version && (includePrereleases || !candidate.release.prerelease))
    .sort((left, right) => compareVersions(right.version, left.version));
  if (candidates.length === 0) throw new Error('GitHub has no compatible published release.');
  const latestVersion = candidates[0].version;
  return {
    currentVersion,
    latestVersion,
    available: compareVersions(latestVersion, currentVersion) > 0,
    url: candidates[0].release.html_url || RELEASES_URL
  };
}

module.exports = { RELEASES_API_URL, RELEASES_URL, checkForUpdate, compareVersions, releaseVersion };
