# @mineprompt/mineflayer-ui

Theme-neutral presentation state for Mineflayer interfaces. The package converts live bot state and events into plain serializable objects for desktop, web, terminal, or remote interfaces.

```js
const { createMineflayerUiState } = require('@mineprompt/mineflayer-ui');

const presentation = createMineflayerUiState(bot, {
  onChange: (snapshot) => render(snapshot)
});
```

`snapshot()` includes HUD vitals, experience, held-item use, mounts, boss bars, scoreboard state, titles, subtitles, and action-bar text. Call `close()` before discarding the bot.

The package has no renderer or asset dependency. `heartSprite`, `foodSprite`, and `formatDuration` are available for custom interface adapters.

It can also be loaded as a Mineflayer plugin:

```js
const { mineflayerUiPlugin } = require('@mineprompt/mineflayer-ui');

bot.loadPlugin(mineflayerUiPlugin);
const unsubscribe = bot.mineflayerUi.subscribe(render);
```
