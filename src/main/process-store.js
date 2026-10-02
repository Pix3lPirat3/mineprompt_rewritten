'use strict';

const LOCAL_STORE_METHOD_NAMES = Object.freeze(['getConnection', 'getAccount', 'getAccounts', 'getServers', 'getSetting', 'getStorageZones', 'getBuildJobs']);
const REMOTE_STORE_METHOD_NAMES = Object.freeze([
  'addConnection', 'addAccount', 'saveAccount', 'removeAccount', 'renameAccount',
  'saveServer', 'removeServer', 'setSetting', 'setSettings', 'saveWorkflow', 'removeWorkflow',
  'saveMiningPreset', 'removeMiningPreset', 'selectMiningPreset', 'saveStorageZone', 'removeStorageZone', 'saveBuildJob', 'removeBuildJob',
  'storageReservationSnapshot', 'reserveStorage', 'renewStorageReservation', 'releaseStorageReservation', 'releaseStorageOwner'
]);
const STORE_METHOD_NAMES = Object.freeze([...LOCAL_STORE_METHOD_NAMES, ...REMOTE_STORE_METHOD_NAMES]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class ProcessStore {
  constructor({ read, request }) {
    if (typeof read !== 'function' || typeof request !== 'function') throw new TypeError('Process store read and request functions are required.');
    this.read = read;
    this.request = request;
  }

  snapshot() {
    return clone(this.read());
  }

  async getConnection() {
    return clone(this.read().connections?.at(-1));
  }

  async getAccount(username) {
    const target = String(username ?? '').toLowerCase();
    return clone(this.read().accounts?.find((account) => account.username.toLowerCase() === target));
  }

  async getAccounts() {
    return clone(this.read().accounts || []);
  }

  async getServers() {
    return clone(this.read().servers || []);
  }

  async getSetting(key) {
    return clone(this.read().settings?.[key]);
  }

  async getStorageZones() {
    return clone(this.read().storageZones || []);
  }

  async getBuildJobs() {
    return clone(this.read().buildJobs || []);
  }
}

for (const method of REMOTE_STORE_METHOD_NAMES) {
  ProcessStore.prototype[method] = function remoteStoreMethod(...args) { return this.request(method, ...args); };
}

module.exports = { LOCAL_STORE_METHOD_NAMES, ProcessStore, REMOTE_STORE_METHOD_NAMES, STORE_METHOD_NAMES };
