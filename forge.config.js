module.exports = {
  packagerConfig: {
    icon: "src/icons/win/computer"
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        // The ICO file to use as the icon for the generated Setup.exe
        setupIcon: '/src/icons/win/computer.ico',
      }
    }
  ],
};
