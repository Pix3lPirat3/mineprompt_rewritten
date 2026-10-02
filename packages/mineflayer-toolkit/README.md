# Mineflayer Toolkit

Composable MinePrompt behavior for ordinary Mineflayer bots. The toolkit provides independent runtime, navigation, mining, tree, inventory, and interaction plugins without requiring Electron, React, MCP, or the MinePrompt desktop application.

```js
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { runtimePlugin, miningPlugin, treePlugin } = require('@mineprompt/mineflayer-toolkit')

const bot = mineflayer.createBot({ host: 'localhost', username: 'Logger' })

bot.loadPlugin(pathfinder)
bot.loadPlugin(runtimePlugin())
bot.loadPlugin(miningPlugin())
bot.loadPlugin(treePlugin())

bot.once('spawn', () => {
  bot.mineprompt.trees.farm({
    policy: {
      radius: 32,
      maxTrees: 12,
      replant: 'available',
      onFailure: 'skip',
      minimumDurability: 20
    }
  })
})
```

Every plugin stores state on its bot instance. Installing the same plugins on multiple bots creates independent capabilities, tasks, policies, and activity locks.

The complete toolkit can be installed in one call:

```js
const { toolkitPlugin } = require('@mineprompt/mineflayer-toolkit')

bot.loadPlugin(pathfinder)
bot.loadPlugin(toolkitPlugin())
```

Capability APIs are available through `bot.mineprompt`, while the shared action registry provides structured operations for terminals, graphical interfaces, workflows, and agent tools.
