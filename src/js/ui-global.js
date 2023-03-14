let bot = null;

let elHead = $('#active-account-head');
let elUsername = $('[data-replace="username"]');
let elRuntime = $('[data-replace="runtime"]');
let elHealth = $('#bot-health');
let elHunger = $('#bot-hunger');
let elPosition = $('[data-replace="position"]');
let elPotionEffects = $('#bot-effects');

let timerRuntimeFade = null;
let interface = {
  sessionStart: null,
  timerRuntimeFade: null,
  reset: function() {
    elUsername.text(i18n.__('interface.title'))

    //elRuntime.empty(); -> Don't empty runtime. It's "important data".
    term.set_prompt(`${i18n.__('interface.console.prompt')} » `);
    interface.resetHead();
    interface.resetPosition();
    interface.resetPotionEffects();
    interface.resetHealth();
    interface.resetHunger();
  },
  setHead: function(username) {
    elHead.attr('src', `https://mc-heads.net/head/${username}/nohelm`);
  },
  resetHead: function() {
    elHead.attr('src', `https://mc-heads.net/head/MHF_Question/nohelm`);
  },
  setHealth: function(health) {
    // Giant thanks to Tom16 for helping me finish this at 2:19am, now I can go to bed.. (Health and Hunger)
    elHealth.empty();
    for (let i = 0; i < Math.floor(Math.ceil(health) / 2); i++) elHealth.append(`<img src="img/hearts/heart-full.png"> `);
    if (Math.round(health) % 2 === 1) elHealth.append(`<img src="img/hearts/heart-half.png"> `);
    for (let i = Math.ceil(health / 2); i < 10; i++) elHealth.append(`<img src="img/hearts/heart-empty.png"> `);
  },
  resetHealth: function() {
    elHealth.empty();
    for (let i = 0; i < 10; i++) elHealth.append(`<img src="img/hearts/heart-empty.png"> `);
  },
  setHunger: function(food) {
    elHunger.empty();
    for (let i = 0; i < Math.floor(Math.ceil(food) / 2); i++) elHunger.append(`<img src="img/hunger/hunger-full.webp"> `);
    if (Math.round(food) % 2 === 1) elHunger.append(`<img src="img/hunger/hunger-half.webp"> `);
    for (let i = Math.ceil(food / 2); i < 10; i++) elHunger.append(`<img src="img/hunger/hunger-empty.webp"> `);
  },
  resetHunger: function() {
    elHunger.empty();
    for (let i = 0; i < 10; i++) elHunger.append(`<img src="img/hunger/hunger-empty.webp"> `);
  },
  resetRuntime: function() {
    elRuntime.css({ 'color': 'rgba(171, 171, 171, 0.99)' });
    clearInterval(timerRuntimeFade);
  },
  startSession: function(username) {
    interface.sessionStart = new Date();
    term.set_prompt(`${username} » `);
    elHead.attr('src', `https://mc-heads.net/head/${username}/nohelm`);
    elUsername.text(username)
  },
  getRuntime: function() {
    let seconds_passed = Math.abs(interface.sessionStart.getTime() - new Date().getTime()) / 1000;
    return forHumans(seconds_passed);
  },
  startRuntime: function() {
    clearInterval(interface.timerRuntimeFade)
    interface.timerRuntime = setInterval(function() {
      if (!interface.sessionStart) return;
        elRuntime.text(interface.getRuntime())
      }, 1000)
  },
  stopRuntime: function() {
    clearInterval(interface.timerRuntime)
    elRuntime.css({
      'color': 'indianred'
    });

    ipcRenderer.invoke('runtime_end');

    interface.timerRuntimeFade = setInterval(function() {
      elRuntime.fadeOut(750);
      elRuntime.fadeIn(750);
    }, 1500);
  },
  setPosition: function(pos) {
    elPosition.text(pos)
  },
  resetPosition: function(pos) {
    elPosition.empty(); // or text('');
  },
  /*
  [
      {
          "effect": "Speed",
          "displayName": "Speed"
      },
      {
          "effect": "JumpBoost",
          "displayName": "Jump Boost"
      }
  ]
  */
  setPotionEffects: function(effects) {
    for(let a = 0; a < effects.length; a++) {
      let effect = effects[a];
      elPotionEffects.append(`<img src="img/effects/${effect.effect}.png" data-tippy-content="${effect.displayName}">`);
    }
  },
  resetPotionEffects: function() {
    elPotionEffects.empty();
  },
}

interface.reset()

let package = require('./../package.json');

tippy('#sidebar-computer', {
  content: 'MinePrompt ' + package.version,
  placement: 'right'
});

/**
 * Translates seconds into human readable format of seconds, minutes, hours, days, and years
 * 
 * @param  {number} seconds The number of seconds to be processed
 * @return {string}         The phrase describing the amount of time
 */
function forHumans(seconds) {
  let levels = [
    [Math.floor(seconds / 31536000), 'years'],
    [Math.floor((seconds % 31536000) / 86400), 'days'],
    [Math.floor(((seconds % 31536000) % 86400) / 3600), 'hours'],
    [Math.floor((((seconds % 31536000) % 86400) % 3600) / 60), 'minutes'],
    [(((Math.floor(seconds) % 31536000) % 86400) % 3600) % 60, 'seconds'],
  ];
  let returntext = '';

  for (let i = 0, max = levels.length; i < max; i++) {
    if (levels[i][0] === 0) continue;
    returntext += ' ' + levels[i][0] + ' ' + (levels[i][0] === 1 ? levels[i][1].substr(0, levels[i][1].length - 1) : levels[i][1]);
  };
  return returntext.trim();
}