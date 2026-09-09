'use strict';

class WorkspaceView {
  constructor(elements, handlers) {
    this.elements = elements;
    this.handlers = handlers;
    this.terminal = null;
    this.events = [];
    this.session = {};
    this.elements.itemContextMenu.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.elements.itemContextMenu.addEventListener('keydown', (event) => this.navigateMenu(event));
    this.elements.containerActions.addEventListener('click', (event) => this.openContainerMenu(event));
    document.addEventListener('pointerdown', () => this.closeItemMenu());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeItemMenu();
    });
    window.addEventListener('resize', () => this.closeItemMenu());
  }

  setTerminal(terminal) {
    this.terminal = terminal;
  }

  renderAccounts(accounts = []) {
    const { accountList, accountEmpty } = this.elements;
    accountList.replaceChildren();
    accountEmpty.hidden = accounts.length > 0;
    for (const account of accounts) {
      const row = document.createElement('div');
      row.className = 'account';
      row.setAttribute('role', 'listitem');
      const connect = document.createElement('button');
      connect.type = 'button';
      connect.className = 'account__connect';
      connect.title = `Connect as ${account.username}`;
      const image = document.createElement('img');
      image.src = this.handlers.playerHead(account.username);
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
      connect.addEventListener('click', () => this.handlers.openConnection(account));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'account__edit';
      edit.title = `Edit ${account.username}`;
      edit.setAttribute('aria-label', `Edit ${account.username}`);
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => this.handlers.openProfile(account));
      row.append(connect, edit);
      accountList.append(row);
    }
  }

  renderServers(servers = []) {
    const { serverList, serverEmpty } = this.elements;
    serverList.replaceChildren();
    serverEmpty.hidden = servers.length > 0;
    for (const server of servers) {
      const row = document.createElement('div');
      row.className = 'server';
      row.setAttribute('role', 'listitem');
      const connect = document.createElement('button');
      connect.type = 'button';
      connect.className = 'server__connect';
      const name = document.createElement('strong');
      name.textContent = server.name;
      const address = document.createElement('span');
      address.textContent = `${server.host}:${server.port}`;
      connect.append(name, address);
      connect.addEventListener('click', () => this.handlers.openConnection(null, server));
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'account__edit';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${server.name}`);
      edit.addEventListener('click', () => this.handlers.openServer(server));
      row.append(connect, edit);
      serverList.append(row);
    }
  }

  actionButton(label, command) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => this.terminal.exec(command));
    return button;
  }

  prepareButton(label, command) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      this.terminal.set_command(command);
      this.terminal.focus();
    });
    return button;
  }

  closeItemMenu() {
    this.elements.itemContextMenu.hidden = true;
    this.elements.itemContextMenu.replaceChildren();
  }

  navigateMenu(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.elements.itemContextMenu.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement);
    const indexes = {
      ArrowDown: current < 0 ? 0 : (current + 1) % buttons.length,
      ArrowUp: current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length,
      Home: 0,
      End: buttons.length - 1
    };
    buttons[indexes[event.key]].focus();
  }

  async runMenuAction(entry) {
    this.closeItemMenu();
    if (entry.confirmation && !await this.handlers.confirmAction(entry.confirmation)) return;
    await this.handlers.inventoryAction({ ...entry.request, confirmed: Boolean(entry.confirmation) });
  }

  showItemMenu(entries, event) {
    event.preventDefault();
    event.stopPropagation();
    const menu = this.elements.itemContextMenu;
    menu.replaceChildren(...entries.map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'menuitem';
      button.textContent = entry.label;
      if (entry.danger) button.dataset.danger = 'true';
      button.addEventListener('click', () => this.runMenuAction(entry));
      return button;
    }));
    menu.hidden = false;
    const anchor = event.currentTarget.getBoundingClientRect();
    const requestedX = event.clientX || anchor.right;
    const requestedY = event.clientY || anchor.bottom;
    menu.style.left = `${Math.max(8, Math.min(requestedX, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(requestedY, window.innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector('button')?.focus();
  }

  request(scope, action, values = {}) {
    return {
      scope,
      action,
      connectionId: this.session.connectionId,
      windowId: this.session.windowId,
      ...values
    };
  }

  itemActions(item, scope) {
    const target = String(item.slot);
    if (scope === 'container') {
      return [
        { label: 'Inspect', request: this.request(scope, 'inspect', { target }) },
        { label: 'Take one', request: this.request(scope, 'take', { target, quantity: 'one' }) },
        { label: 'Take stack', request: this.request(scope, 'take', { target, quantity: 'stack' }) },
        { label: 'Take all matching', request: this.request(scope, 'take', { target, quantity: 'all' }) },
        { label: 'Quick-move stack', request: this.request(scope, 'quick-move', { target }) },
        { label: 'Deposit matching items', request: this.request(scope, 'deposit', { target: item.name, quantity: 'all' }) }
      ];
    }
    const entries = [{ label: 'Inspect', request: this.request(scope, 'inspect', { target }) }];
    if (this.session.containerOpen) {
      entries.push(
        { label: 'Deposit one', request: this.request('container', 'deposit', { target, quantity: 'one' }) },
        { label: 'Deposit stack', request: this.request('container', 'deposit', { target, quantity: 'stack' }) },
        { label: 'Deposit all matching', request: this.request('container', 'deposit', { target, quantity: 'all' }) }
      );
      return entries;
    }
    entries.push(
      { label: 'Use item', request: this.request(scope, 'use', { target }) },
      { label: 'Equip to hand', request: this.request(scope, 'equip', { target, destination: 'hand' }) },
      { label: 'Equip to off hand', request: this.request(scope, 'equip', { target, destination: 'off-hand' }) },
      { label: 'Equip to head', request: this.request(scope, 'equip', { target, destination: 'head' }) },
      { label: 'Equip to torso', request: this.request(scope, 'equip', { target, destination: 'torso' }) },
      { label: 'Equip to legs', request: this.request(scope, 'equip', { target, destination: 'legs' }) },
      { label: 'Equip to feet', request: this.request(scope, 'equip', { target, destination: 'feet' }) }
    );
    if (item.hotbarIndex !== null) entries.push({ label: `Select hotbar slot ${item.hotbarIndex}`, request: this.request(scope, 'select', { target: item.hotbarIndex }) });
    entries.push(
      { label: 'Drop one', danger: true, request: this.request(scope, 'drop', { target, quantity: 'one' }) },
      { label: 'Drop stack', danger: true, request: this.request(scope, 'drop', { target, quantity: 'stack' }) },
      {
        label: 'Drop all matching',
        danger: true,
        confirmation: `Drop every carried stack of ${item.displayName}?`,
        request: this.request(scope, 'drop', { target, quantity: 'all' })
      }
    );
    return entries;
  }

  inventoryEntry(item, scope) {
    const row = document.createElement('div');
    row.className = 'inventory-entry';
    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.className = 'inventory-entry__main';
    inspect.textContent = `${item.slot}. ${item.displayName} x${item.count}`;
    inspect.title = `Inspect ${item.displayName}`;
    inspect.addEventListener('click', () => this.handlers.inventoryAction(this.request(scope, 'inspect', { target: String(item.slot) })));
    inspect.addEventListener('contextmenu', (event) => this.showItemMenu(this.itemActions(item, scope), event));
    inspect.addEventListener('keydown', (event) => {
      if (event.key === 'F10' && event.shiftKey) this.showItemMenu(this.itemActions(item, scope), event);
    });
    const actions = document.createElement('button');
    actions.type = 'button';
    actions.className = 'inventory-entry__menu';
    actions.textContent = 'Actions';
    actions.setAttribute('aria-label', `Actions for ${item.displayName}`);
    actions.addEventListener('click', (event) => this.showItemMenu(this.itemActions(item, scope), event));
    row.append(inspect, actions);
    return row;
  }

  openContainerMenu(event) {
    this.showItemMenu([
      {
        label: 'Deposit inventory',
        confirmation: 'Deposit every carried inventory stack into this container?',
        request: this.request('container', 'deposit', { target: 'all', quantity: 'all' })
      },
      { label: 'Close container', request: this.request('container', 'close') }
    ], event);
  }

  renderSession(session = {}, activities = []) {
    this.session = session;
    const players = session.players || [];
    this.elements.sessionPlayers.replaceChildren(...players.map((player) => {
      const row = document.createElement('div');
      row.className = 'inspector-row';
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = player.username;
      const ping = document.createElement('small');
      ping.textContent = player.ping === null ? (player.visible ? 'Visible' : 'Not visible') : `${player.ping} ms`;
      details.append(name, ping);
      const actions = document.createElement('span');
      actions.className = 'inspector-row__actions';
      actions.append(
        this.actionButton('Follow', `follow ${player.username}`),
        this.actionButton('Go to', `goto ${player.username}`),
        this.prepareButton('Message', `cmd msg ${player.username} `)
      );
      row.append(details, actions);
      return row;
    }));
    this.elements.playersEmpty.hidden = players.length > 0;

    const inventory = session.inventory || [];
    this.elements.sessionInventory.replaceChildren(...inventory.slice(0, 36).map((item) => this.inventoryEntry(item, 'inventory')));
    this.elements.inventoryEmpty.hidden = inventory.length > 0;

    const container = session.container || [];
    this.elements.sessionContainer.replaceChildren(...container.map((item) => this.inventoryEntry(item, 'container')));
    this.elements.containerEmpty.hidden = session.containerOpen && container.length > 0;
    this.elements.containerEmpty.textContent = session.containerOpen ? 'Container is empty.' : 'No container is open.';
    this.elements.containerActions.hidden = !session.containerOpen;

    this.elements.sessionTasks.replaceChildren(...activities.map((activity) => {
      const row = document.createElement('div');
      row.className = 'inspector-row';
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = activity.label;
      const description = document.createElement('small');
      description.textContent = activity.detail;
      details.append(name, description);
      row.append(details, this.actionButton('Stop', `tasks stop ${activity.id}`));
      return row;
    }));
    this.elements.tasksEmpty.hidden = activities.length > 0;
  }

  addEvent(event) {
    this.events.unshift({
      level: event.level,
      message: String(event.message),
      timestamp: Number(event.timestamp) || Date.now()
    });
    this.events = this.events.slice(0, 20);
    this.elements.sessionEvents.replaceChildren(...this.events.map((entry) => {
      const row = document.createElement('div');
      row.className = `event-row event-row--${entry.level}`;
      const time = document.createElement('time');
      time.dateTime = new Date(entry.timestamp).toISOString();
      time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = document.createElement('span');
      message.textContent = entry.message;
      row.append(time, message);
      return row;
    }));
    this.elements.eventsEmpty.hidden = this.events.length > 0;
  }

  renderCommands(commands = [], state = {}, query = '') {
    const search = query.trim().toLowerCase();
    const matches = commands.filter((command) =>
      [command.command, command.category, command.description, ...(command.aliases || [])].join(' ').toLowerCase().includes(search));
    this.elements.commandList.replaceChildren(...matches.map((command) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-card';
      const heading = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = command.command;
      const category = document.createElement('small');
      category.textContent = command.category;
      heading.append(name, category);
      const description = document.createElement('span');
      description.textContent = command.description;
      const usage = document.createElement('code');
      usage.textContent = command.usage;
      button.append(heading, description, usage);
      button.disabled = command.requiresConnection && state.status !== 'online';
      button.addEventListener('click', () => {
        this.handlers.closeCommands();
        this.terminal.set_command(`${command.command} `);
        this.terminal.focus();
      });
      return button;
    }));
    this.elements.commandEmpty.hidden = matches.length > 0;
  }
}

const workspaceViewApi = Object.freeze({ WorkspaceView });

if (typeof module === 'object' && module.exports) {
  module.exports = workspaceViewApi;
} else {
  Object.defineProperty(globalThis, 'minepromptWorkspaceView', { value: workspaceViewApi });
}
