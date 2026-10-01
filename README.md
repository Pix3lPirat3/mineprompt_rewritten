# MinePrompt

MinePrompt is a desktop command client for Minecraft Java Edition. It connects through [mineflayer](https://github.com/PrismarineJS/mineflayer) and provides a focused terminal for chat, movement, inventory work, navigation, and repeatable automation.

The current 2.0 beta replaces the original renderer-owned runtime with a security-focused Electron architecture. Minecraft connections, commands, and storage run outside the web page; the interface can access them only through a small, validated preload API.

## Highlights

- Microsoft and offline-mode connections
- Simultaneous bot sessions with a fast session switcher
- One supervised utility process per bot with crash isolation and fleet status
- A headless host shared by terminal, desktop, plugin, and agent clients
- Dynamic MCP and strict OpenAI tool schemas generated from the live command registry
- Relationship-aware player protection with explicit, audited overrides
- Graphical profile, connection, friend, and security settings
- Saved server profiles and structured reconnect history
- Nearby and all-player views with policy-driven actions
- Searchable command library and graphical session workspace
- Automatic reconnect with bounded attempts
- State-machine automation with exclusive resource ownership
- Graphical workflow authoring with command nodes, delays, repeats, and resource locks
- 40+ built-in commands with aliases and contextual autocomplete
- FaithfulVenom inventory, container, health, hunger, armor, oxygen, experience, effect, boss-bar, and workstation visuals
- Live scoreboard, title, action-bar, mount-health, item-use, and server overlay state
- Player cards with privacy-controlled profile heads and direct actions
- Robust quoted command-line arguments
- Atomic JSON storage in Electron's application-data directory
- Context-isolated renderer with no Node.js integration
- Remote player commands disabled by default and restricted by an allowlist
- Separate permissions for remote status, chat, movement, inventory, combat, and world commands
- Server resource packs declined by default
- Manual GitHub release checks with no automatic downloads

## Download

Download the current build from [GitHub Releases](https://github.com/Pix3lPirat3/mineprompt_rewritten/releases). Windows x64, macOS Intel and Apple silicon, and Linux x64 builds are produced automatically from the same tested revision. Only the current release is retained.

The application is not code-signed. Windows SmartScreen or macOS Gatekeeper may require manual confirmation. Release downloads include SHA-256 checksums and GitHub build provenance.

Packaged downloads include their runtime and do not require Node.js or npm.

## Development requirements

- Node.js 24.11 or newer
- npm 10 or newer
- A supported Windows, macOS, or Linux desktop

No global Electron installation is needed.

## Development

```sh
git clone https://github.com/Pix3lPirat3/mineprompt_rewritten.git
cd mineprompt_rewritten
npm ci
npm start
```

Run the full quality check before committing:

```sh
npm run check
npm run audit
npm run audit:production
```

Build a distributable for the current platform with:

```sh
npm run make
```

## Getting connected

Microsoft authentication is the default:

```text
connect --username player@example.com --host play.example.net
```

For an offline-mode server:

```text
connect --username Alex --auth offline --host localhost --port 25565
```

Server version detection is automatic. If a server requires an explicit protocol version, add `--version`, such as `--version 1.21.8`.

Save a reusable profile:

```text
account add Alex offline
account list
account remove Alex
```

Profiles can also be created and edited from the sidebar. Selecting one opens a connection form without requiring terminal syntax.

## Inventory and containers

The session workspace follows the in-game inventory layout, including crafting, equipment, offhand, main inventory, selected hotbar slot, stack counts, enchantment state, and durability. Hover or focus an item to see its custom name, lore, enchantments, and remaining durability. Hold <kbd>Alt</kbd> while hovering for bounded component values, data tags, stack limits, and technical identifiers. The tooltip uses the Faithful Minecraft background and frame as separate nine-slice images. Minecraft's tooltip display component is interpreted as policy, so its default protocol object is not printed and hidden tooltip sections remain hidden. Drag an item to an exact slot or use Minecraft-style transfer controls while a container is open. Shift-click transfers a stack. Right-click, the keyboard menu key, and <kbd>Shift</kbd>+<kbd>F10</kbd> always open the full action menu, where one, half, and stack transfers are explicit.

Inventory data, event tracking, texture selection, and window rendering are separate modules. Window open, slot update, property update, hotbar selection, and close events are streamed to the interface as they happen. Container windows are classified into reusable families such as storage, hopper, furnace, brewing, enchanting, anvil, smithing, merchant, and generic layouts.

Faithful item textures are always preferred when an item PNG exists. Placeable blocks such as stone, dirt, planks, and ores use block textures because the resource pack renders those inventory icons from block models and does not include duplicate item PNGs for them.

```text
inventory list
inventory inspect 36
inventory equip diamond_pickaxe hand
inventory use cooked_beef
inventory swing diamond_sword right
inventory drop cobblestone stack

container list
container take diamond one
container deposit cobblestone all
container transfer container 4 stack
container transfer inventory 36 half
container close
```

Use `openwindow` to open the workstation under the cursor, a workstation at coordinates, or a nearby villager. Crafting tables expose Mineflayer recipe data in both the graphical workspace and the `craft` command. Villager offers use the same validated trade action from the graphical trade list and the `container trade` command. Furnaces, enchanting tables, and anvils use Mineflayer's dedicated high-level operations in both the workspace and the `workstation` command. Brewing, smithing, stonecutting, loom, cartography, beacon, and grindstone windows provide labeled, server-synchronized slots with the same drag and transfer behavior.

The world ribbon tracks the block and entity under the cursor alongside nearby items, mobs, and villagers. Click or right-click a target for inspection, navigation, collection, interaction, combat, mining, or trading. Both world and player ribbons hide their scrollbars and support mouse-wheel or pointer-drag navigation.

```text
target
target block inspect
target block dig
target block mine 4
target entity activate
target entity useitem
target entity trade
entities items 16
entities 42 pickup
stash nearby
stash nearby 24 16
stash inventory cobblestone 16
stash status
stash stop
consistentmine start
consistentmine start 4
consistentmine start 120 64 -32 1
```

Consistent mining locks the starting coordinates when it begins. Depth mode extends from that block along the dominant cursor direction, so regenerated blocks at those positions are mined without allowing the target to drift deeper as the camera moves. Brief non-diggable server substitutions at a locked position are treated as a waiting state and mining resumes when the expected block returns. A replacement that remains non-diggable for 10 seconds stops the task. Mining defaults to the best safe tool, switches before 10 durability remains, rejects fluid blocks and fluid-adjacent openings, and avoids blocks beneath falling material.

`stash nearby` records the bot's position and view, locates the nearest chest, barrel, or shulker box, collects loaded item drops in range, deposits only the resulting inventory increase, and returns to the saved position and view. If the container is already within interaction range, the bot turns to use it without walking over. A running consistent-mine task pauses during collection and resumes after the return. `stash inventory` uses the same route and restoration behavior for an explicit item, slot, or `all` selection.

The policy-driven `mine` command also supports bounded cuboids and the current chunk. Region mining works from the top down, groups blocks by player reach, shortlists safe standing positions by coverage, then compares them with Mineflayer Pathfinder's bounded A* route cost. Every block is validated again immediately before digging. In the GUI, use a block context menu to set the first region corner, open another block menu to run the selection, or send it to the docked terminal for advanced flags.

```text
mine once
mine region 100 60 100 115 63 115
mine chunk 8
mine stop
mine status

miningpolicy save "Safe Quarry" --min-durability 32 --low switch
miningpolicy list
miningpolicy show "Safe Quarry"
miningpolicy use "Safe Quarry"
miningpolicy use default

consistentmine start --tool held --low stop --min-durability 25
mine region 100 60 100 108 64 108 --include stone,deepslate --exclude diamond_ore
mine chunk 4 --allow-fluid-adjacent --allow-falling
```

Mining flags can be combined:

- `--tool auto|held|hand` chooses automatic tool selection, the current held tool, or hand mining.
- `--low switch|stop|skip` controls behavior when no allowed tool has the requested reserve.
- `--min-durability N` preserves that many durability points.
- `--include` and `--exclude` accept comma-separated block names.
- `--reach`, `--max-blocks`, `--allow-fluid-adjacent`, and `--allow-falling` tune routing and hazard policy.
- `--preset "Policy Name"` selects a saved policy before applying command-specific flag overrides.

The Mining policies window creates, edits, selects, and removes the same policies exposed by `miningpolicy`. The selected policy applies to context-menu mining, ordinary terminal mining, headless sessions, and structured agent calls. Policy records use the current schema only; older shapes are ignored rather than converted.

Inventory and container tooltips follow the pointer with Minecraft-style viewport flipping. Custom names and lore retain their supported Minecraft color and text formatting, while Alt reveals bounded component and NBT details for development without crowding ordinary gameplay tooltips.

## Reusable Mineflayer UI state

`@mineprompt/mineflayer-ui` is a theme-neutral workspace package that converts a Mineflayer bot into serializable presentation state. It tracks HUD vitals, oxygen, experience, held-item use, mounts, boss bars, scoreboard state, titles, subtitles, and the action bar without depending on React or Electron. MinePrompt's renderer is one consumer; another app can supply its own layout and assets.

```js
const { createMineflayerUiState } = require('@mineprompt/mineflayer-ui');

const presentation = createMineflayerUiState(bot, {
  onChange: (snapshot) => render(snapshot)
});
```

Call `presentation.snapshot()` for current state and `presentation.close()` when the bot session ends. The package also exports bounded normalization and texture-name helpers for custom renderers. Visual assets remain outside the package so consumers are free to provide another resource pack or design system.

Mineflayer plugin users can pass the exported `mineflayerUiPlugin` to `bot.loadPlugin`, then subscribe through `bot.mineflayerUi`. Multiple subscribers receive the same normalized snapshot without duplicating protocol listeners.

For live development, `eval` runs JavaScript inside the selected bot's isolated process. It can inspect or modify every exposed object and is intentionally unsafe. Asynchronous expressions and statement bodies are supported. Returned values are bounded and cycle-safe so Mineflayer objects can cross the local host protocol.

```text
eval bot.inventory.slots[36]
eval bot.inventory
eval bot.currentWindow
eval await bot.world.getColumnAt(bot.entity.position)
```

A blocking expression can freeze that bot process, and evaluated code can read files, access the network, or change bot state. The command is console-only and should be used only with code you trust.

Text Display entities are decoded through the active protocol registry. Their text appears in the world ribbon tooltip, compact entity summary, and shared inspect action.

```text
workstation put-input raw_iron 16
workstation put-fuel coal 4
workstation take-output
workstation enchant 2
workstation combine diamond_sword enchanted_book Restored Blade
workstation rename diamond_pickaxe Quarry Tool
```

## Players and sessions

The player ribbon can show nearby players first or every online player. Its action registry evaluates each player before rendering an action. Follow and attack are hidden when a player is not nearby, friends are protected from attack, and unavailable location actions remain visible but disabled when useful context should be preserved. Player menus can add or remove friends without opening settings.

```text
player PlayerName actions
player PlayerName follow
player PlayerName message Hello
player PlayerName attack
friends add PlayerName
```

Friends remain visible in the action menu, but Attack is disabled with a protection reason. Hold <kbd>Ctrl</kbd>+<kbd>Shift</kbd> while the player menu is open to enable the explicit override. The terminal uses a matching narrow option:

```text
player PlayerName attack --override-friend-protection
friends list
friends check PlayerName
friends remove PlayerName
```

Player actions are checked again in the main runtime immediately before Mineflayer executes them. Renderer state is never treated as authorization.

Connecting while the selected bot is busy creates another simultaneous session. Select a bot from the session bar or fleet view to bind the inventory, players, tasks, commands, and terminal completion context to it. Each bot runs in a separate Electron utility process, so a failed protocol or automation session cannot take down the desktop interface or another bot. Background work owns named resources such as movement, combat, chat, inventory, and world interaction, preventing incompatible tasks from controlling the same bot system at once.

## Automation workflows

The workflow studio creates reusable linear state machines from command and wait nodes. A workflow can repeat up to 100 times and reserve movement, combat, chat, inventory, or world resources for its complete run. Active workflows appear in the world ribbon and can be stopped there or from the terminal.

```text
workflow list
workflow show Patrol
workflow run Patrol
workflow stop Patrol
workflow remove Patrol
```

Bulk drops and full-inventory deposits require `confirm` at the end of the terminal command. Context-menu actions display a confirmation dialog instead. Existing commands such as `equip`, `dropitem`, `changeslot`, `useitem`, `window`, and `closecontainer` remain available as shortcuts.

## Security settings

Review the active policy:

```text
settings
```

Resource packs are declined unless explicitly enabled:

```text
settings resource-packs accept
settings resource-packs deny
```

Online player heads are also disabled by default because fetching one shares the player name with `mc-heads.net`. They can be enabled from the graphical settings or explicitly:

```text
settings player-heads enable
settings player-heads disable
```

Commands sent from Minecraft chat are ignored by default. Enabling them still requires each player to be added to the allowlist:

```text
settings remote-player add PlayerName
settings remote-commands enable
```

Choose remote command permissions in the graphical security settings. A player must be listed and the command's permission group must be enabled.

Disable access or remove a player at any time:

```text
settings remote-commands disable
settings remote-player remove PlayerName
```

Treat an allowed remote player as someone with control over the connected bot. Commands marked console-only remain unavailable through game chat.

## Data locations

MinePrompt stores profiles, preferences, mining policies, workflows, and recent connection arguments in Electron's per-user application-data directory as `mineprompt.json`. Microsoft authentication tokens remain in `.minecraft/mineprompt-cache` and can be reviewed or removed with the `cache` command.

The headless host also keeps a local authentication token named `runtime-token` in that application-data directory. Desktop and agent clients use it over a Windows named pipe or Unix domain socket. MinePrompt does not open a network listener for local control.

The store contains authentication mode, not account passwords. Login and registration command arguments are redacted from terminal output.

## Command extensions

Public commands are CommonJS modules inside `commands/global` or `commands/mineflayer`. The command contract and an example are in [CONTRIBUTING.md](CONTRIBUTING.md). Run `reload commands` after editing a command module. <kbd>Ctrl</kbd>+<kbd>R</kbd> reloads the renderer, while <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> reloads commands and the renderer. These paths preserve the application host and connected bot processes. Changes to backend service modules still require restarting the affected process.

Private commands can live beside `mineprompt.json` in the application-data directory under `commands/global` or `commands/mineflayer`. They are loaded from the local machine at runtime and are never included in packaged builds or this repository. Commands receive an explicit runtime context instead of application globals. This is the appropriate location for server-specific diagnostics and private test commands.

The context includes `relationships`, which provides `list`, `find`, `has`, `isFriend`, `add`, and `remove`. It also includes `targets` and `dispatchTargetAction` for cursor, entity, villager, and mining integrations. Player-targeting plugins should register through `actions` or call the shared dispatchers so relationship policy is enforced automatically. Code that calls the raw Mineflayer bot is trusted code and can bypass application policy.

Run `settings paths` to print the exact private command and application-data locations for the current system.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the command contract and project checks.

## Headless and agent use

Start MinePrompt without Electron:

```sh
npm run start:headless
```

The host owns the store and one isolated process per bot. Opening the desktop app with the same application-data path attaches to that host instead of launching duplicate bot sessions. Set `MINEPROMPT_DATA_DIR` to an absolute directory when separate installations need to share an explicit runtime.

Run one terminal command against an existing host:

```sh
node src/headless.js exec "friends list"
```

Start the local MCP server for an AI client:

```sh
npm run start:mcp
```

The MCP process attaches to an existing host or becomes the host when none is running. The desktop app also starts an attachable host when it launches first, so opening MCP later reaches the bots already visible in the GUI. Tool discovery is generated at runtime, so connected commands and private command modules appear without maintaining a separate agent document. `mineprompt_ui_state` returns the selected bot snapshot together with the renderer's viewport, inventory fit, visible controls, broken images, component failures, inventory pipeline timing, transport delay, renderer update volume, DOM mutation volume, and long tasks. `mineprompt_diagnostics` returns a bounded, redacted support snapshot. `mineprompt_reload` reloads commands, the renderer, or both without disconnecting bots. `mineprompt_inventory_inspect` reads complete rendered item details without changing state. `mineprompt_debug_evaluate` exposes the live evaluator with an `acknowledgeUnsafe: true` requirement and destructive safety annotations. State-changing tools publish MCP safety annotations, and friend overrides require both `overrideFriendProtection` and `confirmOverride` for agent callers.

Clients that accept OpenAI function definitions instead of MCP can generate strict JSON Schema tools:

```sh
npm run tools:export
```

JSONL is reserved for event and audit streams. Capability documentation uses JSON Schema through MCP or the generated OpenAI function export.

## License

Review [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for licensing details. The bundled FaithfulVenom textures cannot be used in monetized content.
