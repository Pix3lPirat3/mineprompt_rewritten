module.exports = {
  command: 'reconnect',
  usage: 'reconnect',
  description: 'Reconnect to the last attempted server.',
  author: 'Pix3lPirat3',
  requires: {
    console: true
  },
  execute: async function(sender, command, args) {

    let last_connection = await database.getConnection();
    if(!last_connection) return console.log(`[Reconnect] No connection stored, try connecting to a server first.`);

    term.exec(`connect ${last_connection}`)
  }
}