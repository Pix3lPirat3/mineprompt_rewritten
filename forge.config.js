const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { VitePlugin } = require('@electron-forge/plugin-vite');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

function packageIgnore(file) {
  if (!file) return false;
  file = file.replaceAll('\\', '/');
  const roots = ['/.vite', '/commands', '/node_modules', '/package.json', '/packages', '/src'];
  if (!roots.some((root) => file === root || file.startsWith(`${root}/`))) return true;
  if (file.startsWith('/packages/') && !['/packages/mineflayer-ui', '/packages/mineflayer-ui/package.json', '/packages/mineflayer-ui/index.cjs'].includes(file)) return true;
  if (file.startsWith('/src/') && file !== '/src/main' && file !== '/src/session-worker.js' && !file.startsWith('/src/main/')) return true;
  const bedrockData = '/node_modules/minecraft-data/minecraft-data/data/bedrock';
  const bedrockCommon = `${bedrockData}/common`;
  if (file.startsWith(`${bedrockData}/`) && file !== bedrockCommon && !file.startsWith(`${bedrockCommon}/`)) return true;
  return false;
}

module.exports = {
  packagerConfig: {
    asar: { unpackDir: '{commands,node_modules,packages,src}' },
    executableName: 'MinePrompt',
    icon: process.platform === 'win32' ? 'src/icons/win/computer' : undefined,
    ignore: packageIgnore
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'MinePrompt',
        setupIcon: 'src/icons/win/computer.ico',
        loadingGif: 'src/gif/dolphin.gif'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    },
    {
      name: '@electron-forge/maker-deb',
      config: { options: { bin: 'MinePrompt' } }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: { options: { bin: 'MinePrompt' } }
    }
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/electron.js', config: 'vite.main.config.mjs', target: 'main' },
        { entry: 'src/js/preload.js', config: 'vite.preload.config.mjs', target: 'preload' }
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
    })
  ]
};
