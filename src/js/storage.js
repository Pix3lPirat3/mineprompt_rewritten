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

    /* Print SQL Inputs
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
    
    this.setAccounts();
  },
  addAccount: async function(username, authentication) {
    const stmt = await this.db.prepare('INSERT OR IGNORE INTO accounts (username, authentication) VALUES (?, ?);')
    await stmt.bind({ 1: username, 2: authentication })
    return await stmt.get()
  },
  removeAccount: async function(username) {
    const stmt = await this.db.prepare('DELETE FROM accounts WHERE username = ?;')
    await stmt.bind({ 1: username })
    let result = await stmt.get();
    this.setAccounts();
  },
  setAccounts: async function() {
    sidebar.accounts.clear();
    if(this.type === 'sqlite3') {
      let accounts = await database.db.all('SELECT username FROM accounts');

      accounts.forEach((row) => {
        let username = row.username;
        sidebar.accounts.add({ username: row.username, authentication: row.authentication })
      });
    }
  },
  getAccount: async function(username) {
    const stmt = await this.db.prepare('SELECT * FROM accounts WHERE username = ?;')
    await stmt.bind({ 1: username })
    return await stmt.get();
  },
  getSetting: async function(setting) {
    const stmt = await this.db.prepare('SELECT * FROM settings WHERE setting = ?;')
    await stmt.bind({ 1: setting })
    return (await stmt.get())?.value;
  },
  setSetting: async function(setting, value) {
    console.debug(`[Settings] Set ${setting} to ${value}`)
    const stmt = await this.db.prepare('INSERT OR REPLACE INTO settings(setting, value) VALUES (?, ?);')
    await stmt.bind({ 1: setting, 2: value })
    return await stmt.get();
  },
  close: function() {
    this.db.close();
  }
}

database.start();