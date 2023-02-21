module.exports = {
  packagerConfig: {
    icon: "src/icons/win/computer",
    ignore: ["^/cache/", "/mineprompt", "/generate-embed.js", ".tmp", ".todo", "/commands/mineflayer/customs"],
  },
  rebuildConfig: {},
  makers: [{
    name: '@electron-forge/maker-squirrel',
    config: {
      // The ICO file to use as the icon for the generated Setup.exe
      //setupIcon: '/src/icons/win/computer.ico',
    }
  }],
  hooks: {
    prePackage: function(platform, arch) {

    },
    preMake: function() {

    }
  }
};