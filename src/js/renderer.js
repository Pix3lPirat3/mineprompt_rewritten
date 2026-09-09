'use strict';

const elements = {
  version: document.querySelector('#app-version'),
  accountList: document.querySelector('#account-list'),
  accountEmpty: document.querySelector('#account-empty'),
  serverList: document.querySelector('#server-list'),
  serverEmpty: document.querySelector('#server-empty'),
  addAccount: document.querySelector('#add-account'),
  addServer: document.querySelector('#add-server'),
  openSettings: document.querySelector('#open-settings'),
  openCommands: document.querySelector('#open-commands'),
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
  serverDialog: document.querySelector('#server-dialog'),
  serverForm: document.querySelector('#server-form'),
  serverTitle: document.querySelector('#server-title'),
  serverOriginal: document.querySelector('#server-original'),
  serverName: document.querySelector('#server-name'),
  serverHost: document.querySelector('#server-host'),
  serverPort: document.querySelector('#server-port'),
  serverVersion: document.querySelector('#server-version'),
  serverFakeHost: document.querySelector('#server-fake-host'),
  serverError: document.querySelector('#server-error'),
  deleteServer: document.querySelector('#delete-server'),
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
  settingsAutoReconnect: document.querySelector('#settings-auto-reconnect'),
  settingsReconnectAttempts: document.querySelector('#settings-reconnect-attempts'),
  settingsExternalHeads: document.querySelector('#settings-external-heads'),
  settingsRemoteEnabled: document.querySelector('#settings-remote-enabled'),
  settingsRemotePlayers: document.querySelector('#settings-remote-players'),
  clearHistory: document.querySelector('#clear-history'),
  checkUpdate: document.querySelector('#check-update'),
  openReleases: document.querySelector('#open-releases'),
  updateStatus: document.querySelector('#update-status'),
  exportDiagnostics: document.querySelector('#export-diagnostics'),
  settingsError: document.querySelector('#settings-error'),
  commandsDialog: document.querySelector('#commands-dialog'),
  commandSearch: document.querySelector('#command-search'),
  commandList: document.querySelector('#command-list'),
  commandEmpty: document.querySelector('#command-empty'),
  sessionPlayers: document.querySelector('#session-players'),
  playersEmpty: document.querySelector('#players-empty'),
  sessionInventory: document.querySelector('#session-inventory'),
  inventoryEmpty: document.querySelector('#inventory-empty'),
  sessionContainer: document.querySelector('#session-container'),
  containerEmpty: document.querySelector('#container-empty'),
  containerActions: document.querySelector('#container-actions'),
  sessionTasks: document.querySelector('#session-tasks'),
  tasksEmpty: document.querySelector('#tasks-empty'),
  sessionEvents: document.querySelector('#session-events'),
  eventsEmpty: document.querySelector('#events-empty'),
  itemContextMenu: document.querySelector('#item-context-menu'),
  actionConfirmDialog: document.querySelector('#action-confirm-dialog'),
  actionConfirmMessage: document.querySelector('#action-confirm-message')
};

let terminal;
let workspaceView;
let state = { status: 'disconnected', sessionStartedAt: null };
let snapshot = { accounts: [], servers: [], preferences: {}, commands: [], activities: [], session: {} };

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

function confirmAction(message) {
  elements.actionConfirmMessage.textContent = message;
  elements.actionConfirmDialog.returnValue = 'cancel';
  showDialog(elements.actionConfirmDialog);
  return new Promise((resolve) => {
    elements.actionConfirmDialog.addEventListener('close', () => resolve(elements.actionConfirmDialog.returnValue === 'confirm'), { once: true });
  });
}

async function inventoryAction(request) {
  try {
    return await window.mineprompt.inventoryAction(request);
  } catch (error) {
    terminal.error(errorMessage(error));
    return { ok: false, error: errorMessage(error) };
  }
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

function openConnection(account = null, server = null) {
  const fallbackAccount = account || snapshot.accounts?.[0];
  elements.connectUsername.value = fallbackAccount?.username || '';
  elements.connectAuth.value = fallbackAccount?.authentication ? 'microsoft' : 'offline';
  elements.connectHost.value = server?.host || '';
  elements.connectPort.value = String(server?.port || 25565);
  elements.connectVersion.value = server?.version || '';
  elements.connectFakeHost.value = server?.fakeHost || '';
  setError(elements.connectError);
  showDialog(elements.connectDialog, elements.connectUsername.value ? elements.connectHost : elements.connectUsername);
}

function openPreferences() {
  const preferences = snapshot.preferences || {};
  elements.settingsResourcePacks.value = preferences.resourcePackPolicy === 'accept' ? 'accept' : 'deny';
  elements.settingsAutoReconnect.checked = preferences.automaticReconnectEnabled === true;
  elements.settingsReconnectAttempts.value = String(preferences.reconnectAttempts || 3);
  elements.settingsExternalHeads.checked = preferences.externalPlayerHeadsEnabled === true;
  elements.settingsRemoteEnabled.checked = preferences.remoteCommandsEnabled === true;
  elements.settingsRemotePlayers.value = Array.isArray(preferences.remoteCommandPlayers)
    ? preferences.remoteCommandPlayers.join('\n')
    : '';
  const capabilities = new Set(preferences.remoteCommandCapabilities || []);
  document.querySelectorAll('[name="remote-capability"]').forEach((input) => {
    input.checked = capabilities.has(input.value);
  });
  elements.clearHistory.textContent = 'Clear history';
  elements.checkUpdate.textContent = 'Check now';
  elements.openReleases.hidden = true;
  elements.updateStatus.textContent = 'Check GitHub Releases manually.';
  setError(elements.settingsError);
  showDialog(elements.settingsDialog, elements.settingsResourcePacks);
}

function openServer(server = null) {
  elements.serverTitle.textContent = server ? 'Edit server' : 'Add server';
  elements.serverOriginal.value = server?.name || '';
  elements.serverName.value = server?.name || '';
  elements.serverHost.value = server?.host || '';
  elements.serverPort.value = String(server?.port || 25565);
  elements.serverVersion.value = server?.version || '';
  elements.serverFakeHost.value = server?.fakeHost || '';
  elements.deleteServer.hidden = !server;
  elements.deleteServer.dataset.confirming = '';
  elements.deleteServer.textContent = 'Delete';
  setError(elements.serverError);
  showDialog(elements.serverDialog, elements.serverName);
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
  const statusLabels = {
    authenticating: 'Authenticating',
    connecting: 'Connecting',
    disconnected: 'Offline',
    disconnecting: 'Disconnecting',
    failed: 'Failed',
    joining: 'Joining',
    online: 'Online',
    reconnecting: 'Reconnecting'
  };
  const displayName = state.displayName || state.username;
  elements.activeName.textContent = displayName || (['connecting', 'authenticating', 'joining', 'reconnecting'].includes(state.status) ? `${statusLabels[state.status]}...` : 'Not connected');
  elements.activeHead.src = playerHead(displayName);
  elements.activePosition.textContent = state.position || state.lastError || (connected ? 'Waiting for position...' : 'Connect to a Java server to begin');
  elements.status.textContent = statusLabels[state.status] || 'Offline';
  elements.status.className = `status status--${state.status || 'disconnected'}`;
  elements.quickConnect.textContent = state.status === 'disconnected' ? 'Connect' : state.status === 'online' ? 'Disconnect' : 'Cancel';
  renderVital(elements.health, state.health, 'hearts', 'heart');
  renderVital(elements.hunger, state.hunger, 'hunger', 'hunger');
  renderEffects(state.effects);
  if (workspaceView) workspaceView.renderCommands(snapshot.commands, state, elements.commandSearch.value);
}

function renderSnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  elements.version.textContent = `Version ${snapshot.version}`;
  workspaceView.renderAccounts(snapshot.accounts);
  workspaceView.renderServers(snapshot.servers);
  renderState(snapshot.state);
  workspaceView.renderSession(snapshot.session, snapshot.activities);
  workspaceView.renderCommands(snapshot.commands, state, elements.commandSearch.value);
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
  if (event.level !== 'log' && event.level !== 'debug') workspaceView?.addEvent(event);
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

async function submitServer(event) {
  event.preventDefault();
  setError(elements.serverError);
  try {
    await window.mineprompt.saveServer({
      originalName: elements.serverOriginal.value,
      name: elements.serverName.value,
      host: elements.serverHost.value,
      port: elements.serverPort.value,
      version: elements.serverVersion.value,
      fakeHost: elements.serverFakeHost.value
    });
    closeDialog(elements.serverDialog);
  } catch (error) {
    setError(elements.serverError, error);
  }
}

async function removeServer() {
  if (elements.deleteServer.dataset.confirming !== 'true') {
    elements.deleteServer.dataset.confirming = 'true';
    elements.deleteServer.textContent = 'Confirm delete';
    return;
  }
  setError(elements.serverError);
  try {
    await window.mineprompt.removeServer(elements.serverOriginal.value);
    closeDialog(elements.serverDialog);
  } catch (error) {
    setError(elements.serverError, error);
  }
}

async function submitConnection(event) {
  event.preventDefault();
  setError(elements.connectError);
  try {
    const result = await window.mineprompt.connect({
      username: elements.connectUsername.value,
      auth: elements.connectAuth.value,
      host: elements.connectHost.value,
      port: elements.connectPort.value,
      version: elements.connectVersion.value,
      fakeHost: elements.connectFakeHost.value
    });
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
  const remoteCommandCapabilities = [...document.querySelectorAll('[name="remote-capability"]:checked')].map((input) => input.value);
  try {
    await window.mineprompt.savePreferences({
      resourcePackPolicy: elements.settingsResourcePacks.value,
      automaticReconnectEnabled: elements.settingsAutoReconnect.checked,
      reconnectAttempts: elements.settingsReconnectAttempts.value,
      externalPlayerHeadsEnabled: elements.settingsExternalHeads.checked,
      remoteCommandsEnabled: elements.settingsRemoteEnabled.checked,
      remoteCommandPlayers,
      remoteCommandCapabilities
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
    historyFilter: globalThis.minepromptTerminalPolicy.shouldStoreCommand,
    outputLimit: 1000,
    scrollOnEcho: true,
    checkArity: false,
    caseSensitiveAutocomplete: false,
    completion() {
      const input = this.get_command().slice(0, this.get_position());
      return window.mineprompt.complete(input);
    },
    keymap: {
      'CTRL+R': () => {
        void window.mineprompt.reloadCommands();
        return false;
      }
    }
  });

  terminal.history().set(terminal.history().data().filter(globalThis.minepromptTerminalPolicy.shouldStoreCommand));
  workspaceView = new globalThis.minepromptWorkspaceView.WorkspaceView(elements, {
    closeCommands: () => closeDialog(elements.commandsDialog),
    confirmAction,
    inventoryAction,
    openConnection,
    openProfile,
    openServer,
    playerHead
  });
  workspaceView.setTerminal(terminal);

  window.mineprompt.on('log', echoLog);
  window.mineprompt.on('state', renderState);
  window.mineprompt.on('snapshot', renderSnapshot);
  window.mineprompt.on('attention', () => {
    document.body.classList.remove('attention');
    requestAnimationFrame(() => document.body.classList.add('attention'));
  });

  elements.addAccount.addEventListener('click', () => openProfile());
  elements.addServer.addEventListener('click', () => openServer());
  elements.openSettings.addEventListener('click', openPreferences);
  elements.openCommands.addEventListener('click', () => {
    elements.commandSearch.value = '';
    workspaceView.renderCommands(snapshot.commands, state, '');
    showDialog(elements.commandsDialog, elements.commandSearch);
  });
  elements.quickConnect.addEventListener('click', async () => {
    if (state.status === 'disconnected') return openConnection();
    await window.mineprompt.disconnect();
  });
  elements.profileForm.addEventListener('submit', submitProfile);
  elements.deleteProfile.addEventListener('click', removeProfile);
  elements.serverForm.addEventListener('submit', submitServer);
  elements.deleteServer.addEventListener('click', removeServer);
  elements.connectForm.addEventListener('submit', submitConnection);
  elements.settingsForm.addEventListener('submit', submitPreferences);
  elements.commandSearch.addEventListener('input', () => workspaceView.renderCommands(snapshot.commands, state, elements.commandSearch.value));
  elements.clearHistory.addEventListener('click', () => {
    terminal.purge();
    elements.clearHistory.textContent = 'History cleared';
  });
  elements.checkUpdate.addEventListener('click', async () => {
    elements.checkUpdate.disabled = true;
    elements.checkUpdate.textContent = 'Checking...';
    try {
      const result = await window.mineprompt.checkForUpdate();
      elements.updateStatus.textContent = result.available
        ? `Version ${result.latestVersion} is available.`
        : `Version ${result.currentVersion} is current.`;
      elements.openReleases.hidden = !result.available;
    } catch (error) {
      elements.updateStatus.textContent = errorMessage(error);
    } finally {
      elements.checkUpdate.disabled = false;
      elements.checkUpdate.textContent = 'Check now';
    }
  });
  elements.openReleases.addEventListener('click', () => window.mineprompt.openReleases());
  elements.exportDiagnostics.addEventListener('click', async () => {
    elements.exportDiagnostics.disabled = true;
    try {
      const result = await window.mineprompt.exportDiagnostics();
      if (result.ok) elements.exportDiagnostics.textContent = 'Exported';
    } catch (error) {
      elements.updateStatus.textContent = errorMessage(error);
    } finally {
      elements.exportDiagnostics.disabled = false;
    }
  });
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
