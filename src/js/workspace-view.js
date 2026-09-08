'use strict';

class WorkspaceView {
  constructor(elements, handlers) {
    this.elements = elements;
    this.handlers = handlers;
    this.terminal = null;
    this.events = [];
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

  renderSession(session = {}, activities = []) {
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
    this.elements.sessionInventory.replaceChildren(...inventory.slice(0, 36).map((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'inventory-row';
      row.textContent = `${item.slot}. ${item.displayName} x${item.count}`;
      row.title = `Run inventory ${item.slot}`;
      row.addEventListener('click', () => this.terminal.exec(`inventory ${item.slot}`));
      return row;
    }));
    this.elements.inventoryEmpty.hidden = inventory.length > 0;

    const container = session.container || [];
    this.elements.sessionContainer.replaceChildren(...container.map((item) => {
      const row = document.createElement('div');
      row.className = 'inventory-row inventory-row--readonly';
      row.textContent = `${item.slot}. ${item.displayName} x${item.count}`;
      return row;
    }));
    this.elements.containerEmpty.hidden = container.length > 0;

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
