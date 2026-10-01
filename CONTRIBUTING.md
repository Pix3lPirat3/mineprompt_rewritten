# Contributing

Contributions should keep MinePrompt approachable at the command line and conservative around account or server data.

## Before opening a change

1. Install with `npm ci` on Node.js 22.13 or newer.
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
  category: 'custom',
  capability: 'status',
  requires: {
    entity: true,
    console: true
  },
  autocomplete(command, args, context, completion) {
    return ['first', 'second'];
  },
  async execute(sender, command, args, context) {
    const { bot, store } = context;
    sender.reply(`Received ${args.length} values.`);
  }
};
```

`requires.entity` blocks the command until the bot has spawned. `requires.console` prevents execution through Minecraft chat. `sender.reply` is the correct response path for both terminal and permitted remote callers.

Autocomplete receives `completion.input` and `completion.trailingSpace` so multi-stage commands can distinguish a partial argument from the start of the next argument.

`capability` controls remote access and must be one of `status`, `chat`, `movement`, `inventory`, `combat`, or `world`. Omit it when a private command should never run through Minecraft chat.

Commands receive an explicit context containing `bot`, `store`, `client`, `commands`, `connections`, `inventory`, `crafting`, `actions`, `relationships`, `automation`, `workflowRunner`, `interfaceState`, `activities`, and `logger`. Shared behavior belongs in a module under `src/main`.

Use `relationships.isFriend(player)` for presentation and planning. Register player interactions through `actions.register` so the central policy dispatcher can enforce relationship rules during execution. Relationship writes should use `relationships.add` and `relationships.remove` instead of editing store settings directly.

Every loaded command receives a generated agent tool name, risk level, approval recommendation, and JSON Schema argument envelope. The terminal library, MCP server, and OpenAI export all read the live registry. Keep `description` and `usage` concise because agents and people see the same metadata.

Commands must validate numeric bounds and enums before calling mineflayer. Repeating work must register its cleanup function with `context.activities` so disconnects and reloads stop it automatically. Declare resources such as `movement`, `combat`, `chat`, or `world` when work needs exclusive control. Use `context.automation` for asynchronous state-machine tasks that need abort signals and lifecycle cleanup.

Server-specific commands and test credentials do not belong in the repository. Keep private command modules in the per-user application-data `commands` directory and keep connection details in local environment configuration.

## Commit style

Prefer small, descriptive commits written in the imperative mood, such as `Harden external link handling` or `Validate navigation coordinates`.
