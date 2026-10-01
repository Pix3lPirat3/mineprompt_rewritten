# Changelog

## 2.0.0-beta.21 - 2026-09-13

- Handled temporarily missing Mineflayer entity attributes without interrupting health packets or the connection loop.
- Hardened reusable HUD attribute parsing for null values, maps, and malformed modifier collections.
- Isolated presentation snapshot failures and reported them through session diagnostics.

## 2.0.0-beta.20 - 2026-09-13

- Fixed duplicate renderer subscriptions created during development startup and consolidated each inventory publication into one store update.
- Coalesced rapid slot and container-property bursts before snapshot serialization and IPC while keeping lifecycle events immediate.
- Reduced unrelated sidebar, terminal, HUD, and toast work during inventory changes and extended diagnostics with publication counts.

## 2.0.0-beta.19 - 2026-09-13

- Added inventory pipeline rates, serialization timing, transport delay, renderer workload, and long-task diagnostics.
- Added command and renderer reloads through the terminal, keyboard shortcuts, and MCP without disconnecting bots.
- Centralized target actions, host methods, and isolated-session methods in validated manifests.

## 2.0.0-beta.18 - 2026-09-13

- Kept locked-position mining active through brief non-diggable server block substitutions and restored its isolated-host routing.
- Added nearby item collection and nearest-container deposits through entity menus, terminal commands, and MCP.
- Isolated inventory updates from unrelated player and world-target rendering.

## 2.0.0-beta.17 - 2026-09-13

- Added item-aware arm swings to inventory menus, terminal commands, and MCP actions.
- Kept advanced tooltip details responsive to Alt without exposing Electron's native menu.

## 2.0.0-beta.16 - 2026-09-13

- Made inventory right-click consistently open a complete action menu with explicit transfer amounts.
- Aligned item, entity, and block actions across the GUI, terminal, Mineflayer methods, and MCP tools.
- Exposed live renderer layout and bounded UI failures through read-only MCP diagnostics.

## 2.0.0-beta.15 - 2026-09-13

- Hid empty scoreboard surfaces and stabilized inventory drag and tooltip updates.
- Added localized renderer recovery with component stacks, session state, and recent interaction diagnostics.
- Added rapid inventory synchronization and renderer failure coverage to desktop testing.

## 2.0.0-beta.14 - 2026-09-13

- Fixed raw Minecraft chat components appearing as object placeholders in live overlays.
- Added nested and serialized component coverage for scoreboards and shared UI text.

## 2.0.0-beta.13 - 2026-09-13

- Fixed entity actions being rejected by the shared desktop and headless host.
- Added end-to-end host transport coverage for entity navigation.

## 2.0.0-beta.12 - 2026-09-13

- Fixed the reusable UI package failing to load through the Vite development server.
- Added synchronized ESM and CommonJS builds with development-browser coverage.

## 2.0.0-beta.11 - 2026-09-13

- Added live Minecraft boss bars, scoreboard, titles, action bar, mount health, oxygen, and absorption.
- Rebuilt HUD vitals, effects, experience, hotbar, drag feedback, and workstation progress with Faithful assets.
- Extracted a reusable theme-neutral Mineflayer presentation state package.
- Added normal and Alt-advanced item tooltips with shared Minecraft framing.
- Expanded presentation-state, renderer, and packaged desktop coverage.

## 2.0.0-beta.10 - 2026-09-13

- Rebuilt item tooltip framing with the Faithful background and frame nine-slices.
- Interpreted Minecraft tooltip display policy without printing protocol defaults.
- Added read-only MCP item inspection and intentionally unsafe live-session evaluation.
- Added terminal eval with cycle-safe, bounded output for bot and inventory debugging.
- Unified desktop, headless, and MCP clients around one shared local runtime.

## 2.0.0-beta.9 - 2026-09-13

- Fixed inventory and container tooltips remaining hidden after pointer entry.
- Added real slot-hover coverage across serialization, host transport, renderer state, and portals.
- Centralized renderer stores, snapshots, API mocks, item fixtures, and browser setup for isolated tests.
- Kept tooltips compatible with in-flight sessions started before a renderer reload.

## 2.0.0-beta.8 - 2026-09-13

- Rebuilt item tooltips with Faithful textures and cursor-aware Minecraft placement.
- Added formatted custom names and lore through the active Prismarine Chat renderer.
- Replaced component key lists with bounded component and NBT values.
- Added rich item serialization and packaged texture coverage.
- Allowed isolated development profiles to run beside the normal desktop app.

## 2.0.0-beta.7 - 2026-09-13

- Added named mining policies with a graphical editor and matching terminal management.
- Applied active policies consistently across GUI, terminal, headless, and agent mining actions.
- Ranked mining positions with bounded Mineflayer Pathfinder A* cost instead of straight-line distance alone.
- Backported Pathfinder A* heap, composite-goal, unreachable-goal, and idle-stop fixes with install-time verification.
- Centralized navigation with verified arrival, bounded waits, and non-latching cancellation.
- Added policy completion, persistence, transport, navigation, route-cost, and editor coverage.
- Reviewed the current Mineflayer Pathfinder pull request queue without pinning an unreviewed fork.
- Kept clean installs working under npm 12's Git dependency policy.

## 2.0.0-beta.6 - 2026-09-13

- Added policy-driven single, consistent, cuboid, and current-chunk mining.
- Added automatic tool switching, configurable durability reserves, block filters, and safe stop or skip behavior.
- Added fluid-edge and falling-block checks with live validation before every dig.
- Added reach-aware route batching with deterministic generated-world coverage tests.
- Added Text Display metadata to entity tooltips and inspection output.
- Added Minecraft-style item tooltips for custom names, lore, enchantments, durability, components, and data tags.
- Hardened partial dropped-item entities that arrive before their metadata packet.
- Updated XState to 5.33.0.
- Validated survival durability, fluid hazards, region routing, display entities, and villagers in the private test lab.

## 2.0.0-beta.5 - 2026-09-13

- Added live cursor block and entity targets with shared GUI, terminal, plugin, and agent actions.
- Added filtered entity browsing, item collection, navigation, interaction, combat, and villager trading entry points.
- Added locked-position consistent mining with exact-block and bounded-depth modes.
- Added friend controls to player menus and friend protection to automated combat.
- Replaced the session panel with compact target and task controls.
- Added wheel and drag navigation to horizontal ribbons and expanded target coverage.
- Extended responsive inventory scaling for target-rich compact layouts.

## 2.0.0-beta.4 - 2026-09-11

- Added a relationship service with global and server-scoped player identities.
- Added friend-safe player actions with explicit GUI, terminal, plugin, and agent overrides.
- Added generated JSON Schema tool definitions, strict OpenAI exports, and an MCP server.
- Added an authenticated headless host that shares isolated bot sessions with the desktop app.
- Expanded relationship, action, host, MCP, desktop attachment, and agent-tool coverage.

## 2.0.0-beta.3 - 2026-09-11

- Isolated every bot session in a supervised Electron utility process.
- Added a fleet view and graphical workflow studio with reusable XState automation.
- Added dedicated furnace, enchanting, anvil, crafting, and villager controls with terminal equivalents.
- Reduced packaged runtime data and texture assets without narrowing Java Edition support.
- Expanded desktop, workflow, process, workstation, and package coverage.
- Fixed the blank development window caused by legacy texture module loading.
- Tightened the inventory workspace, moved live changes to toasts, and removed redundant empty panels.
- Normalized status effect and inventory texture routing and added structured renderer diagnostics.
- Consolidated active bots and saved profiles into one sidebar session switcher.
- Added responsive whole-inventory scaling with right-side, vertically centered containers.

## 2.0.0-beta.2 - 2026-09-11

- Rebuilt the desktop interface with React, Redux Toolkit, Vite, and a dockable terminal.
- Added simultaneous bot sessions with session-aware commands, inventory, players, and tasks.
- Rebuilt inventory and container windows with exact drag and drop plus stack, half-stack, and single-item transfers.
- Added recipe-driven crafting, villager trades, and reusable workstation layouts.
- Added policy-driven player actions with nearby checks and friend protection.
- Added XState automation lifecycles and exclusive movement, combat, chat, inventory, and world resources.
- Restored contextual Tab completion for commands, players, items, and arguments.
- Modularized inventory windows, texture resolution, and live window events.
- Updated runtime and build dependencies and removed known npm audit findings.
- Added FaithfulVenom item, block, status effect, and interface textures with required licensing details.
- Replaced privileged renderer behavior with a typed preload bridge and a contained application protocol.
- Added shared terminal and context-menu inventory controls.
- Updated Electron to 44.3.0.
- Fixed clean installs with npm 10 and refreshed CI actions.
- Added saved server profiles, a command library, and live session panels.
- Added automatic reconnect controls and clearer connection states.
- Added centralized task cleanup and task controls.
- Added granular remote command permissions.
- Added manual GitHub release checks and redacted diagnostic exports.
- Kept sensitive authentication commands out of terminal history.
- Replaced command globals with an explicit runtime context.
- Hardened packaged builds with Electron fuses.
