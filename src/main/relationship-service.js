'use strict';

const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/u;
const RELATIONSHIP_KINDS = new Set(['friend', 'blocked', 'trusted']);

function normalizeUsername(value) {
  return String(value ?? '').trim();
}

function normalizeRelationship(value) {
  const username = normalizeUsername(value?.username);
  const kind = String(value?.kind || 'friend').toLowerCase();
  if (!PLAYER_NAME.test(username)) throw new TypeError('Enter a valid Java player name.');
  if (!RELATIONSHIP_KINDS.has(kind)) throw new TypeError('The relationship type is invalid.');
  return {
    kind,
    username,
    uuid: typeof value?.uuid === 'string' && value.uuid.trim() ? value.uuid.trim().toLowerCase() : null,
    server: typeof value?.server === 'string' && value.server.trim() ? value.server.trim().toLowerCase() : null
  };
}

function normalizeRelationships(values) {
  if (!Array.isArray(values)) return [];
  const relationships = [];
  for (const value of values) {
    try {
      const relationship = normalizeRelationship(value);
      const duplicate = relationships.some((candidate) =>
        candidate.kind === relationship.kind &&
        candidate.username.toLowerCase() === relationship.username.toLowerCase() &&
        candidate.server === relationship.server);
      if (!duplicate) relationships.push(relationship);
    } catch {}
  }
  return relationships.sort((left, right) => left.kind.localeCompare(right.kind) || left.username.localeCompare(right.username));
}

class RelationshipService {
  constructor(store) {
    this.store = store;
  }

  list(kind = null) {
    const relationships = normalizeRelationships(this.store.snapshot().settings.relationships);
    return kind ? relationships.filter((relationship) => relationship.kind === kind) : relationships;
  }

  find(player, context = {}) {
    const username = normalizeUsername(typeof player === 'string' ? player : player?.username);
    const uuid = typeof player === 'object' && typeof player?.uuid === 'string' ? player.uuid.toLowerCase() : null;
    const server = typeof context.server === 'string' && context.server.trim() ? context.server.trim().toLowerCase() : null;
    return this.list().filter((relationship) => {
      if (relationship.server && relationship.server !== server) return false;
      if (relationship.uuid && uuid) return relationship.uuid === uuid;
      return relationship.username.toLowerCase() === username.toLowerCase();
    });
  }

  has(kind, player, context = {}) {
    return this.find(player, context).some((relationship) => relationship.kind === kind);
  }

  isFriend(player, context = {}) {
    return this.has('friend', player, context);
  }

  async add(input) {
    const relationship = normalizeRelationship(input);
    const relationships = this.list();
    const exists = relationships.some((candidate) =>
      candidate.kind === relationship.kind &&
      candidate.username.toLowerCase() === relationship.username.toLowerCase() &&
      candidate.server === relationship.server);
    if (!exists) {
      relationships.push(relationship);
      await this.store.setSetting('relationships', normalizeRelationships(relationships));
    }
    return relationship;
  }

  async remove(kind, username, server = null) {
    const target = normalizeUsername(username).toLowerCase();
    const scope = typeof server === 'string' && server.trim() ? server.trim().toLowerCase() : null;
    const relationships = this.list();
    const filtered = relationships.filter((relationship) => !(
      relationship.kind === kind && relationship.username.toLowerCase() === target && relationship.server === scope
    ));
    if (filtered.length === relationships.length) return false;
    await this.store.setSetting('relationships', filtered);
    return true;
  }

  async replaceFriends(usernames) {
    const retained = this.list().filter((relationship) => relationship.kind !== 'friend');
    const friends = [...new Set((Array.isArray(usernames) ? usernames : []).map(normalizeUsername).filter(Boolean).map((name) => name.toLowerCase()))]
      .map((lowercaseName) => normalizeRelationship({ kind: 'friend', username: usernames.find((name) => normalizeUsername(name).toLowerCase() === lowercaseName) }));
    await this.store.setSetting('relationships', normalizeRelationships([...retained, ...friends]));
    return this.list('friend');
  }

  friendNames() {
    return this.list('friend').map((relationship) => relationship.username);
  }
}

module.exports = { PLAYER_NAME, RELATIONSHIP_KINDS, RelationshipService, normalizeRelationship, normalizeRelationships, normalizeUsername };
