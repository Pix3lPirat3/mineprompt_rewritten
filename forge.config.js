module.exports = {
  packagerConfig: {
    asar: true,
    icon: "src/icons/win/computer",
    ignore: ["^/cache/", "/mineprompt", "/generate-embed.js", ".tmp", ".todo", "/commands/mineflayer/customs"],
  },
  rebuildConfig: {
    mode: 'parallel' // If this even works in Windows
  },
  rebuildConfig: {},
  makers: [{
    name: '@electron-forge/maker-squirrel',
    config: {
      loadingGif: 'src/gif/dolphin.gif', // a gif installer file
      // The ICO file to use as the icon for the generated Setup.exe
      //setupIcon: '/src/icons/win/computer.ico',
    }
  }]
};