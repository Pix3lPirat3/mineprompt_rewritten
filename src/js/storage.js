// TODO: Allow for MySQL support..?

let sqlite3;

let database = {
  type: 'sqlite3',
  db: null,
  start: async function(type) {
    this.require(type);
    this.open(type);
    this.createTables(type);
  },
  require: function(type) {
    if(type === 'sqlite3') sqlite3 = require('sqlite3').verbose();
  },
  open: function() {
    if(database.type === 'sqlite3') {
      this.db = new sqlite3.Database('mineprompt');
    }
  },
  createTables: function() {
    if(this.type === 'sqlite3') {
      this.db.serialize(() => {

        this.db.run(`CREATE TABLE IF NOT EXISTS accounts (
          username TEXT NOT NULL PRIMARY KEY,
          authentication TEXT NOT NULL
        );`)

        this.db.run(`CREATE TABLE IF NOT EXISTS settings (
          setting TEXT NOT NULL PRIMARY KEY,
          value TEXT NOT NULL
        );`)

        // DEBUG SET 1 and 2
        /*
        this.addAccount('Pix3lPirat3', 'microsoft')
        this.addAccount('Pix3lP3nguin', 'microsoft')
        this.addAccount('Pix3lSlime', 'microsoft')
        this.addAccount('Notch', 'microsoft')
        this.addAccount('Dinnerbone', 'microsoft')
        this.addAccount('DoctorWho', 'microsoft')
        */
          
      });
    }
    this.setAccounts();
  },
  addAccount: function(username, authentication) {
    let stmt = this.db.prepare(`INSERT OR IGNORE INTO accounts (username, authentication) VALUES (?, ?);`);
    stmt.run(username, authentication);
    stmt.finalize(function(err) {
      if(err) console.log(err);
      database.setAccounts();
    });
  },
  removeAccount: function(username) {
    let stmt = this.db.prepare(`DELETE FROM accounts WHERE username = ?;`);
    stmt.run(username);
    stmt.finalize(function(err) {
      if(err) console.log(err);
    });
    this.setAccounts();
  },
  setAccounts: function() {
    sidebar.accounts.clear();
    if(this.type === 'sqlite3') {
      this.db.each("SELECT username, authentication FROM accounts", (err, row) => {
        if(err) return console.error(err);
        let username = row.username;
        sidebar.accounts.add({ username: row.username, authentication: row.authentication })
      });
    }
  },
  getAccount: function(username) {

  },
  get: function(path) {

  },
  set: function(path) {

  },
  close: function() {
    if(this.type === 'sqlite3') this.db.close();
  }
}

database.start('sqlite3');

/*
db.serialize(() => {
    db.run("CREATE TABLE lorem (info TEXT)");

    const stmt = db.prepare("INSERT INTO lorem VALUES (?)");
    for (let i = 0; i < 10; i++) {
        stmt.run("Ipsum " + i);
    }
    stmt.finalize();

    db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
        console.log(row.id + ": " + row.info);
    });
});

db.close();
*/