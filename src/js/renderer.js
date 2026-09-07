'use strict';

const elements = {
  version: document.querySelector('#app-version'),
  accountList: document.querySelector('#account-list'),
  accountEmpty: document.querySelector('#account-empty'),
  addAccount: document.querySelector('#add-account'),
  activeHead: document.querySelector('#active-head'),
  activeName: document.querySelector('#active-name'),
  activePosition: document.querySelector('#active-position'),
  status: document.querySelector('#connection-status'),
  health: document.querySelector('#health'),
  hunger: document.querySelector('#hunger'),
  effects: document.querySelector('#effects'),
  runtime: document.querySelector('#runtime')
};

let terminal;
let state = { status: 'disconnected', sessionStartedAt: null };

$.terminal.new_formatter((value) => String(value).replace(
  /^(cmd\s+\/?(?:login|register)\s+)\S+/iu,
  '$1********'
));

function assetPath(category, file) {
  return `img/${category}/${file}`;
}

function playerHead(username) {
  return username
    ? `https://mc-heads.net/head/${encodeURIComponent(username)}/nohelm`
    : assetPath('heads', 'wood_question.png');
}

function quote(value) {
  const text = String(value);
  return /^[\w.@:/-]+$/u.test(text) ? text : `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function renderAccounts(accounts = []) {
  elements.accountList.replaceChildren();
  elements.accountEmpty.hidden = accounts.length > 0;
  for (const account of accounts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account';
    button.setAttribute('role', 'listitem');
    button.title = `Prepare a connection as ${account.username}`;

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
    button.append(image, details);
    button.addEventListener('click', () => {
      const auth = account.authentication ? 'microsoft' : 'offline';
      terminal.set_command(`connect --username ${quote(account.username)} --auth ${auth} --host `);
      terminal.focus(true);
    });
    elements.accountList.append(button);
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
  elements.activeName.textContent = displayName || (state.status === 'connecting' ? 'Connecting…' : 'Not connected');
  elements.activeHead.src = playerHead(displayName);
  elements.activePosition.textContent = state.position || (connected ? 'Waiting for position…' : 'Connect to a Java server to begin');
  elements.status.textContent = state.status === 'online' ? 'Online' : state.status === 'connecting' ? 'Connecting' : 'Offline';
  elements.status.className = `status status--${state.status || 'disconnected'}`;
  renderVital(elements.health, state.health, 'hearts', 'heart');
  renderVital(elements.hunger, state.hunger, 'hunger', 'hunger');
  renderEffects(state.effects);
}

function renderSnapshot(snapshot) {
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
  elements.runtime.textContent = state.sessionStartedAt ? formatDuration(Date.now() - state.sessionStartedAt) : '—';
}

function echoLog(event) {
  if (!terminal || !event?.message) return;
  const safeMessage = $.terminal.escape_brackets(String(event.message));
  const colors = { error: '#ee7e86', warn: '#f0bd70', debug: '#758195', info: '#9ac7ad' };
  const color = colors[event.level];
  terminal.echo(color ? `[[;${color};]${safeMessage}]` : safeMessage);
}

async function initialize() {
  terminal = $('#terminal').terminal(async (input) => {
    if (input.trim()) await window.mineprompt.execute(input);
  }, {
    name: 'mineprompt',
    prompt: 'mineprompt › ',
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

  try {
    const snapshot = await window.mineprompt.getSnapshot();
    renderSnapshot(snapshot);
    terminal.echo(`[[b;#6ed899;]MinePrompt ${snapshot.version}]`);
    terminal.echo('Type "help" to explore commands, or choose a saved profile.');
  } catch (error) {
    terminal.error(`MinePrompt could not initialize: ${error.message}`);
  }

  elements.addAccount.addEventListener('click', () => {
    terminal.set_command('account add ');
    terminal.focus(true);
  });
  setInterval(updateRuntime, 1000);
  updateRuntime();
}

void initialize();
