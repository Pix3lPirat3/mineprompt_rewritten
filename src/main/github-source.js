'use strict';

const packageJson = require('../../package.json');
const { parsePullReference, pullReference } = require('./engine-reference');

const API_ROOT = 'https://api.github.com';
const RAW_ROOT = 'https://raw.githubusercontent.com';

class GitHubSource {
  constructor({ fetchImpl = globalThis.fetch, timeout = 15000, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '' } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
    this.fetch = fetchImpl;
    this.timeout = timeout;
    this.token = String(token || '').trim();
  }

  async request(pathname, accept = 'application/vnd.github+json') {
    const response = await this.fetch(`${API_ROOT}${pathname}`, {
      headers: Object.fromEntries(Object.entries({
        Accept: accept,
        Authorization: this.token ? `Bearer ${this.token}` : null,
        'User-Agent': `MinePrompt/${packageJson.version}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }).filter(([, value]) => value)),
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!response.ok) throw new Error(`GitHub returned status ${response.status} for ${pathname}.`);
    return accept === 'application/vnd.github.raw+json' ? response.text() : response.json();
  }

  async raw(repository, revision, filename) {
    const segments = String(repository).split('/').map(encodeURIComponent);
    const url = `${RAW_ROOT}/${segments.join('/')}/${encodeURIComponent(revision)}/${String(filename).split('/').map(encodeURIComponent).join('/')}`;
    const response = await this.fetch(url, {
      headers: { 'User-Agent': `MinePrompt/${packageJson.version}` },
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!response.ok) throw new Error(`GitHub returned status ${response.status} for ${filename} at ${repository}@${revision}.`);
    return response.text();
  }

  async pull(value) {
    const reference = parsePullReference(value);
    const metadata = await this.request(`/repos/${encodeURIComponent(reference.owner)}/${encodeURIComponent(reference.repository)}/pulls/${reference.number}`);
    if (!metadata?.head?.sha || !metadata?.head?.repo?.clone_url || !metadata?.base?.repo?.full_name) throw new Error(`GitHub returned incomplete metadata for ${pullReference(reference)}.`);
    const sourcePackage = JSON.parse(await this.raw(metadata.head.repo.full_name, metadata.head.sha, 'package.json'));
    if (!sourcePackage?.name || typeof sourcePackage.name !== 'string') throw new Error(`${pullReference(reference)} does not contain a named root package.`);
    return {
      reference: pullReference(reference),
      number: reference.number,
      title: String(metadata.title || ''),
      state: String(metadata.state || ''),
      draft: metadata.draft === true,
      mergeable: metadata.mergeable === true,
      mergeState: String(metadata.mergeable_state || 'unknown'),
      updatedAt: String(metadata.updated_at || ''),
      url: String(metadata.html_url || `https://github.com/${pullReference(reference).replace('#', '/pull/')}`),
      package: sourcePackage.name,
      packageVersion: String(sourcePackage.version || ''),
      head: { sha: metadata.head.sha, repository: metadata.head.repo.full_name, cloneUrl: metadata.head.repo.clone_url },
      base: { sha: metadata.base.sha, repository: metadata.base.repo.full_name, cloneUrl: metadata.base.repo.clone_url }
    };
  }

  async openPulls(owner, maximum = 100) {
    const username = String(owner || '').trim();
    if (!/^[A-Za-z0-9-]{1,39}$/u.test(username)) throw new Error('Enter a valid GitHub username.');
    const query = encodeURIComponent(`author:${username} is:pr org:PrismarineJS is:open`);
    const result = await this.request(`/search/issues?q=${query}&per_page=${Math.max(1, Math.min(100, Number(maximum) || 100))}`);
    if (!Array.isArray(result?.items)) throw new Error('GitHub returned invalid pull request search results.');
    return result.items.map((item) => ({
      reference: `${String(item.repository_url || '').split('/').slice(-2).join('/')}#${item.number}`,
      title: String(item.title || ''),
      url: String(item.html_url || ''),
      updatedAt: String(item.updated_at || '')
    }));
  }

  async repository(owner, name) {
    const metadata = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
    const revision = await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(metadata.default_branch)}`);
    if (!metadata?.clone_url || !revision?.sha) throw new Error(`GitHub returned incomplete repository metadata for ${owner}/${name}.`);
    return {
      repository: `${owner}/${name}`,
      cloneUrl: metadata.clone_url,
      branch: metadata.default_branch,
      sha: revision.sha,
      url: metadata.html_url,
      description: String(metadata.description || '')
    };
  }
}

module.exports = { API_ROOT, GitHubSource, RAW_ROOT };
