# MinePrompt

MinePrompt is a desktop command client for Minecraft Java Edition. It connects through [mineflayer](https://github.com/PrismarineJS/mineflayer) and provides a focused terminal for chat, movement, inventory work, navigation, and repeatable automation.

The current 2.0 beta replaces the original renderer-owned runtime with a security-focused Electron architecture. Minecraft connections, commands, and storage run outside the web page; the interface can access them only through a small, validated preload API.

## Highlights

- Microsoft and offline-mode connections
- Graphical profile, connection, and security settings
- Saved server profiles and structured reconnect history
- Searchable command library and live session inspector
- Automatic reconnect with bounded attempts
- Centralized background task controls
- 40+ built-in commands with aliases and autocomplete
- Live health, hunger, position, effects, and session time
- Robust quoted command-line arguments
- Atomic JSON storage in Electron's application-data directory
- Context-isolated renderer with no Node.js integration
- Remote player commands disabled by default and restricted by an allowlist
- Separate permissions for remote status, chat, movement, inventory, combat, and world commands
- Server resource packs declined by default
- Manual GitHub release checks with no automatic downloads

## Requirements

- Node.js 22 or newer
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

MinePrompt stores profiles, preferences, and recent connection arguments in Electron's per-user application-data directory as `mineprompt.json`. Microsoft authentication tokens remain in `.minecraft/mineprompt-cache` and can be reviewed or removed with the `cache` command.

The store contains authentication mode, not account passwords. Login and registration command arguments are redacted from terminal output.

## Command extensions

Public commands are CommonJS modules inside `commands/global` or `commands/mineflayer`. Use `commands/mineflayer/template.js` as the starting point, then press <kbd>Ctrl</kbd>+<kbd>R</kbd> while the app is running to reload command modules.

Private commands can live beside `mineprompt.json` in the application-data directory under `commands/global` or `commands/mineflayer`. They are loaded from the local machine at runtime and are never included in packaged builds or this repository. Commands receive an explicit runtime context instead of application globals. This is the appropriate location for server-specific diagnostics and private test commands.

Run `settings paths` to print the exact private command and application-data locations for the current system.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the command contract and project checks.

## License

Review [LICENSE](LICENSE) and [TERMS.md](TERMS.md) for the project's licensing and usage terms.
