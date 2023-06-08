// TODO: Allow for MySQL support..?

let sqlite3 = require('sqlite3').verbose();
let sqlite = require('sqlite');

let database = {
  db: null,
  start: async function() {
    //this.require(type);
    await this.open();
    this.createTables();
  },
  open: async function() {
    this.db = await sqlite.open({
      filename: './../mineprompt.db',
      driver: sqlite3.Database
    })

    // Print SQL Inputs
    /*
    this.db.on('trace', (data) => {
      console.debug(data)
    })
    */

    return this.db;
  },
  createTables: async function() {

    await this.db.run(`CREATE TABLE IF NOT EXISTS accounts (
      username TEXT NOT NULL PRIMARY KEY,
      authentication TEXT NOT NULL
    );`);

    await this.db.run(`CREATE TABLE IF NOT EXISTS settings (
      setting TEXT NOT NULL PRIMARY KEY,
      value TEXT NOT NULL
    );`);

    await this.db.run(`CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL
    );`);
    
    this.setAccounts();
  },
  addConnection: function(options) {
    console.debug(`[addConnection] Adding: ${options}`)
    return new Promise((resolve, reject) => {
      database.db.prepare('INSERT OR REPLACE INTO connections(command) VALUES (?);').then(function(stmt) {
        stmt.bind({ 1: options });
        resolve(stmt.run());
      });
    });
  },
  getConnection: async function() {
    return (await database.db.get('SELECT * FROM connections ORDER BY id DESC LIMIT 1;'))?.command;
  },
  addAccount: async function(username, authentication) {
    const stmt = await this.db.prepare('INSERT OR IGNORE INTO accounts (username, authentication) VALUES (?, ?);');
    await stmt.bind({ 1: username, 2: authentication });
    await stmt.get();
    return this.setAccounts();
  },
  removeAccount: async function(username) {
    const stmt = await this.db.prepare('DELETE FROM accounts WHERE username = ?;');
    await stmt.bind({ 1: username });
    let result = await stmt.get();
    this.setAccounts();
  },
  setAccounts: async function() {
    sidebar.accounts.clear();
    let accounts = await this.db.all('SELECT username, authentication FROM accounts');
    
    accounts.forEach((row) => {
      let username = row.username;
      let authentication = row.authentication;
      sidebar.accounts.add({ username: username, authentication: authentication });
    });
  },
  getAccount: function(username) {
    return new Promise((resolve, reject) => {
      database.db.prepare('SELECT * FROM accounts WHERE username = ?;').then(function(stmt) {
        stmt.bind({ 1: username });
        stmt.get().then(function(res) {
          resolve(res);
        })
      });
    });
  },
  getSetting: function(setting) {
    return new Promise((resolve, reject) => {
      database.db.prepare('SELECT * FROM settings WHERE setting = ?;').then(function(stmt) {
        stmt.bind({ 1: setting });
        stmt.get().then(function(res) {
          resolve(res?.value);
        });
      });
    });
  },
  setSetting: function(setting, value) {
    console.debug(`[Settings] Setting ${setting} to ${value}`);
    return new Promise((resolve, reject) => {
      database.db.prepare('INSERT OR REPLACE INTO settings(setting, value) VALUES (?, ?);').then(function(stmt) {
        stmt.bind({ 1: setting, 2: value });
        resolve(stmt.run());
      });
    });
  },
  close: function() {
    this.db.close();
  }
}

database.start();