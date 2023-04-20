const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
  command: 'killaura',
  usage: 'killaura [start || stop] <whitelist Array{*}> [attackDelay {1000ms}]',
  description: 'Attack mobs around you',
  requires: {
    entity: true
  },
  reload: {
    isRunning: false,
    isStopping: false,
    pre: function() {
      if(this.isRunning) console.debug(`[Reload] [Killaura] Stopping the recursive function.`);
      this.isStopping = true;
      this.isRunning = false;
    },
    post: function() {

    }
  },
  author: 'Pix3lPirat3',
  execute: function(sender, command, args) {

    if(!args.length) return sender.reply(`[${this.command}] ${this.usage}`);

    if(args[0] === 'start') {
      if(args.length < 2) {

        return sender.reply(`[${this.command}] You must provide a comma seperated list of mobs. (Or "*")`)
      }
      let whitelist = args[1]?.split(',') || '*';
      this.whitelist = whitelist;
      this.reload.isRunning = true;
      this.reload.isStopping = false;
      this.attackDelay = args[2] || 1000;
      this.start();
      sender.reply(`[Killaura] Starting killaura (Whitelist: ${whitelist.join(', ')})`)
    } if(args[0] === 'stop') {
      sender.reply(`[Killaura] Stopping killaura.`)
      this.reload.isStopping = true;
      this.reload.isRunning = false;
    }

  },
  // TODO: Update to this new system
  whitelist: [],
  blacklist: [],
  searchDelay: 100,
  turnAttackDelay: 250, // The delay between turning and attacking 
  start: function() {
    this.reload.isRunning = true;
    this.attack()
  },
  stop: function(reason) {
    this.reload.isRunning = false;
    this.reload.isStopping = true;
  },
  attack: async function() {
    if(this.reload.isStopping || !this.reload.isRunning) return console.debug('[Killaura] Task stopping due to isStopping or !isRunning')
    let entity = this.getNearestTarget();
    if(!entity || bot.usingHeldItem) return await delay(this.searchDelay), this.attack(); // delay between searches, also if usingHeldItem (eating) search again
    if(!this.isValid(entity)) return await delay(this.searchDelay), this.attack(); 
    await delay(this.attackDelay);
    await bot.lookAt(entity.position.offset(0, 0.5, 0));
    await delay(this.turnAttackDelay); // delay between lookAt and attack
    if(bot.entityAtCursor()?.id !== entity.id) return this.attack(); // The entity wasn't at our cursor, let's search again
    if(!this.isValid(entity)) return await delay(this.searchDelay), this.attack();
    await bot.attack(entity);
    //await delay(1000); // delay between attacks
    this.attack(entity);
  },
  // Double check before attacking
  isValid: function(entity) {
        return bot.entity.position.distanceTo(entity.position) < 3.5 && entity.isValid && (this.whitelist.includes(entity.name) || this.whitelist.includes('*'));
  },
  getNearestTarget() {
    return bot.nearestEntity(entity => this.isValid(entity));
  },
  getWhitelist: function() {
    return this.whitelist;
  },
  setWhitelist: function(arr) {
    this.whitelist = arr;
  },
  isWhitelisted: function(entity) {

  },
  isBlacklisted: function(entity) {

  }
}