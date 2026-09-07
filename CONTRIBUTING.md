# Contributing

Contributions should keep MinePrompt approachable at the command line and conservative around account or server data.

## Before opening a change

1. Install with `npm ci` on Node.js 22 or newer.
2. Keep privileged functionality in `src/main`; renderer code should use only `window.mineprompt` from the preload bridge.
3. Run `npm run check`.
4. Launch with `npm start` for any renderer, IPC, or command change.

## Command modules

A command exports an object with this shape:

```js
module.exports = {
  command: 'example',
  aliases: ['ex'],
  usage: 'example <value>',
  description: 'Explain what the command does.',
  requires: {
    entity: true,
    console: true
  },
  autocomplete(command, args) {
    return ['first', 'second'];
  },
  async execute(sender, command, args) {
    sender.reply(`Received ${args.length} values.`);
  }
};
```

`requires.entity` blocks the command until the bot has spawned. `requires.console` prevents execution through Minecraft chat. `sender.reply` is the correct response path for both terminal and permitted remote callers.

Existing commands can access the compatibility globals `bot`, `database`, `mineflayer`, `commander`, and `interface`. New shared behavior belongs in a module under `src/main` rather than in another global.

Commands must validate numeric bounds and enums before calling mineflayer. Any repeating task must expose a `reload.pre` function that clears its timers or stops its work.

## Commit style

Prefer small, descriptive commits written in the imperative mood, such as `Harden external link handling` or `Validate navigation coordinates`.
