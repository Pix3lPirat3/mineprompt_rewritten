'use strict';

const elements = {
  version: document.querySelector('#app-version'),
  accountList: document.querySelector('#account-list'),
  accountEmpty: document.querySelector('#account-empty'),
  addAccount: document.querySelector('#add-account'),
  openSettings: document.querySelector('#open-settings'),
  quickConnect: document.querySelector('#quick-connect'),
  activeHead: document.querySelector('#active-head'),
  activeName: document.querySelector('#active-name'),
  activePosition: document.querySelector('#active-position'),
  status: document.querySelector('#connection-status'),
  health: document.querySelector('#health'),
  hunger: document.querySelector('#hunger'),
  effects: document.querySelector('#effects'),
  runtime: document.querySelector('#runtime'),
  profileDialog: document.querySelector('#profile-dialog'),
  profileForm: document.querySelector('#profile-form'),
  profileTitle: document.querySelector('#profile-title'),
  profileOriginal: document.querySelector('#profile-original'),
  profileUsername: document.querySelector('#profile-username'),
  profileAuth: document.querySelector('#profile-auth'),
  profileError: document.querySelector('#profile-error'),
  deleteProfile: document.querySelector('#delete-profile'),
  connectDialog: document.querySelector('#connect-dialog'),
  connectForm: document.querySelector('#connect-form'),
  connectUsername: document.querySelector('#connect-username'),
  connectAuth: document.querySelector('#connect-auth'),
  connectHost: document.querySelector('#connect-host'),
  connectPort: document.querySelector('#connect-port'),
  connectVersion: document.querySelector('#connect-version'),
  connectFakeHost: document.querySelector('#connect-fake-host'),
  connectError: document.querySelector('#connect-error'),
  settingsDialog: document.querySelector('#settings-dialog'),
  settingsForm: document.querySelector('#settings-form'),
  settingsResourcePacks: document.querySelector('#settings-resource-packs'),
  settingsExternalHeads: document.querySelector('#settings-external-heads'),
  settingsRemoteEnabled: document.querySelector('#settings-remote-enabled'),
  settingsRemotePlayers: document.querySelector('#settings-remote-players'),
  settingsError: document.querySelector('#settings-error')
};

let terminal;
let state = { status: 'disconnected', sessionStartedAt: null };
let snapshot = { accounts: [], preferences: {} };

$.terminal.new_formatter((value) => String(value).replace(
  /^(cmd\s+\/?(?:login|register)\s+)\S+/iu,
  '$1********'
));

function assetPath(category, file) {
  return `img/${category}/${file}`;
}

function playerHead(username) {
  return username && snapshot.preferences?.externalPlayerHeadsEnabled
    ? `https://mc-heads.net/head/${encodeURIComponent(username)}/nohelm`
    : assetPath('heads', 'wood_question.png');
}

function quote(value) {
  const text = String(value);
  return /^[\w.@:/-]+$/u.test(text) ? text : `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function errorMessage(error) {
  return String(error?.message || error || 'The request could not be completed.')
    .replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

function setError(element, error = '') {
  element.textContent = error ? errorMessage(error) : '';
}

function showDialog(dialog, focusTarget) {
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => focusTarget?.focus());
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function openProfile(account = null) {
  elements.profileTitle.textContent = account ? 'Edit profile' : 'Add profile';
  elements.profileOriginal.value = account?.username || '';
  elements.profileUsername.value = account?.username || '';
  elements.profileAuth.value = account?.authentication ? 'microsoft' : 'offline';
  elements.deleteProfile.hidden = !account;
  elements.deleteProfile.dataset.confirming = '';
  elements.deleteProfile.textContent = 'Delete';
  setError(elements.profileError);
  showDialog(elements.profileDialog, elements.profileUsername);
}

function openConnection(account = null) {
  const fallbackAccount = account || snapshot.accounts?.[0];
  elements.connectUsername.value = fallbackAccount?.username || '';
  elements.connectAuth.value = fallbackAccount?.authentication ? 'microsoft' : 'offline';
  elements.connectHost.value = '';
  elements.connectPort.value = '25565';
  elements.connectVersion.value = '';
  elements.connectFakeHost.value = '';
  setError(elements.connectError);
  showDialog(elements.connectDialog, elements.connectUsername.value ? elements.connectHost : elements.connectUsername);
}

function openPreferences() {
  const preferences = snapshot.preferences || {};
  elements.settingsResourcePacks.value = preferences.resourcePackPolicy === 'accept' ? 'accept' : 'deny';
  elements.settingsExternalHeads.checked = preferences.externalPlayerHeadsEnabled === true;
  elements.settingsRemoteEnabled.checked = preferences.remoteCommandsEnabled === true;
  elements.settingsRemotePlayers.value = Array.isArray(preferences.remoteCommandPlayers)
    ? preferences.remoteCommandPlayers.join('\n')
    : '';
  setError(elements.settingsError);
  showDialog(elements.settingsDialog, elements.settingsResourcePacks);
}

function renderAccounts(accounts = []) {
  elements.accountList.replaceChildren();
  elements.accountEmpty.hidden = accounts.length > 0;
  for (const account of accounts) {
    const row = document.createElement('div');
    row.className = 'account';
    row.setAttribute('role', 'listitem');

    const connect = document.createElement('button');
    connect.type = 'button';
    connect.className = 'account__connect';
    connect.title = `Connect as ${account.username}`;

    const image = document.createElement('img');
    image.src = playerHead(account.username);
    image.alt = '';

    const details = document.createElement('span');
    details.className = 'account__details';
    const name = document.createElement('span');
    name.className = 'account__name';
    name.textContent = account.username;
    const mode = document.createElement('span');
    mode.className = 'account__mode';
    mode.textContent = account.authentication ? 'Microsoft' : 'Offline';
    details.append(name, mode);
    connect.append(image, details);
    connect.addEventListener('click', () => openConnection(account));

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'account__edit';
    edit.title = `Edit ${account.username}`;
    edit.setAttribute('aria-label', `Edit ${account.username}`);
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openProfile(account));
    row.append(connect, edit);
    elements.accountList.append(row);
  }
}

function renderVital(container, value, category, names) {
  const normalized = Math.max(0, Math.min(20, Number(value) || 0));
  const nodes = [];
  for (let index = 0; index < 10; index += 1) {
    const remaining = normalized - index * 2;
    const kind = remaining >= 2 ? 'full' : remaining >= 1 ? 'half' : 'empty';
    const image = document.createElement('img');
    image.src = assetPath(category, `${names}-${kind}.${category === 'hunger' ? 'webp' : 'png'}`);
    image.alt = '';
    nodes.push(image);
  }
  container.replaceChildren(...nodes);
}

function renderEffects(effects = []) {
  const nodes = effects.map((effect) => {
    const image = document.createElement('img');
    const safeName = String(effect.effect || '').toLowerCase().replace(/[^a-z]/gu, '');
    image.src = assetPath('effects', `${safeName}.png`);
    image.alt = effect.displayName || effect.effect || 'Effect';
    image.title = image.alt;
    return image;
  });
  elements.effects.replaceChildren(...nodes);
}

function renderState(nextState = {}) {
  state = { ...state, ...nextState };
  const connected = state.status === 'online';
  const displayName = state.displayName || state.username;
  elements.activeName.textContent = displayName || (state.status === 'connecting' ? 'Connecting...' : 'Not connected');
  elements.activeHead.src = playerHead(displayName);
  elements.activePosition.textContent = state.position || (connected ? 'Waiting for position...' : 'Connect to a Java server to begin');
  elements.status.textContent = state.status === 'online' ? 'Online' : state.status === 'connecting' ? 'Connecting' : 'Offline';
  elements.status.className = `status status--${state.status || 'disconnected'}`;
  renderVital(elements.health, state.health, 'hearts', 'heart');
  renderVital(elements.hunger, state.hunger, 'hunger', 'hunger');
  renderEffects(state.effects);
}

function renderSnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  elements.version.textContent = `Version ${snapshot.version}`;
  renderAccounts(snapshot.accounts);
  renderState(snapshot.state);
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function updateRuntime() {
  elements.runtime.textContent = state.sessionStartedAt ? formatDuration(Date.now() - state.sessionStartedAt) : '--';
}

function echoLog(event) {
  if (!terminal || !event?.message) return;
  const safeMessage = $.terminal.escape_brackets(String(event.message));
  const colors = { error: '#ee7e86', warn: '#f0bd70', debug: '#758195', info: '#9ac7ad' };
  const color = colors[event.level];
  terminal.echo(color ? `[[;${color};]${safeMessage}]` : safeMessage);
}

async function submitProfile(event) {
  event.preventDefault();
  setError(elements.profileError);
  try {
    await window.mineprompt.saveProfile({
      originalUsername: elements.profileOriginal.value,
      username: elements.profileUsername.value,
      authentication: elements.profileAuth.value
    });
    closeDialog(elements.profileDialog);
  } catch (error) {
    setError(elements.profileError, error);
  }
}

async function removeProfile() {
  if (elements.deleteProfile.dataset.confirming !== 'true') {
    elements.deleteProfile.dataset.confirming = 'true';
    elements.deleteProfile.textContent = 'Confirm delete';
    return;
  }
  setError(elements.profileError);
  try {
    await window.mineprompt.removeProfile(elements.profileOriginal.value);
    closeDialog(elements.profileDialog);
  } catch (error) {
    setError(elements.profileError, error);
  }
}

async function submitConnection(event) {
  event.preventDefault();
  setError(elements.connectError);
  const command = [
    'connect',
    '--username', quote(elements.connectUsername.value.trim()),
    '--auth', elements.connectAuth.value,
    '--host', quote(elements.connectHost.value.trim()),
    '--port', elements.connectPort.value
  ];
  if (elements.connectVersion.value.trim()) command.push('--version', quote(elements.connectVersion.value.trim()));
  if (elements.connectFakeHost.value.trim()) command.push('--fake-host', quote(elements.connectFakeHost.value.trim()));
  try {
    const result = await window.mineprompt.execute(command.join(' '));
    if (!result?.ok) throw new Error(result?.error || 'The connection could not be started.');
    closeDialog(elements.connectDialog);
  } catch (error) {
    setError(elements.connectError, error);
  }
}

async function submitPreferences(event) {
  event.preventDefault();
  setError(elements.settingsError);
  const remoteCommandPlayers = elements.settingsRemotePlayers.value.split(/[\s,]+/u).filter(Boolean);
  try {
    await window.mineprompt.savePreferences({
      resourcePackPolicy: elements.settingsResourcePacks.value,
      externalPlayerHeadsEnabled: elements.settingsExternalHeads.checked,
      remoteCommandsEnabled: elements.settingsRemoteEnabled.checked,
      remoteCommandPlayers
    });
    closeDialog(elements.settingsDialog);
  } catch (error) {
    setError(elements.settingsError, error);
  }
}

async function initialize() {
  terminal = $('#terminal').terminal(async (input) => {
    if (input.trim()) await window.mineprompt.execute(input);
  }, {
    name: 'mineprompt',
    prompt: 'mineprompt > ',
    greetings: false,
    historySize: 500,
    outputLimit: 1000,
    scrollOnEcho: true,
    checkArity: false,
    completion: (input) => window.mineprompt.complete(input),
    keymap: {
      'CTRL+R': () => {
        void window.mineprompt.reloadCommands();
        return false;
      }
    }
  });

  window.mineprompt.on('log', echoLog);
  window.mineprompt.on('state', renderState);
  window.mineprompt.on('snapshot', renderSnapshot);
  window.mineprompt.on('attention', () => {
    document.body.classList.remove('attention');
    requestAnimationFrame(() => document.body.classList.add('attention'));
  });

  elements.addAccount.addEventListener('click', () => openProfile());
  elements.openSettings.addEventListener('click', openPreferences);
  elements.quickConnect.addEventListener('click', () => openConnection());
  elements.profileForm.addEventListener('submit', submitProfile);
  elements.deleteProfile.addEventListener('click', removeProfile);
  elements.connectForm.addEventListener('submit', submitConnection);
  elements.settingsForm.addEventListener('submit', submitPreferences);
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(document.querySelector(`#${button.dataset.close}`)));
  });

  try {
    const initialSnapshot = await window.mineprompt.getSnapshot();
    renderSnapshot(initialSnapshot);
    terminal.echo(`[[b;#6ed899;]MinePrompt ${initialSnapshot.version}]`);
    terminal.echo('Type "help" to explore commands, or choose a saved profile.');
  } catch (error) {
    terminal.error(`MinePrompt could not initialize: ${error.message}`);
  }

  setInterval(updateRuntime, 1000);
  updateRuntime();
}

void initialize();
