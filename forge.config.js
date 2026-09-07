module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MinePrompt',
    icon: 'src/icons/win/computer',
    ignore: [
      '^/\\.git/',
      '^/test/',
      '\\.todo$'
    ]
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
      config: {}
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    }
  ]
};
