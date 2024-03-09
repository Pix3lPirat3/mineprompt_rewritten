# MinePrompt Rewritten

As of MinePrompt Rewritten the project has gone under a whole rewrite from the ground up. Thanks to the people in the PrismarineJS community, I've been able to clean up a lot of the design and code.

MinePrompt Discord: https://discord.gg/5FV56jKwpk
---
![MinePrompt Preview Image](https://i.imgur.com/1DsWXlX.png)
---
## Requirements

#### Development 
This project is written in `NodeJS`, and as such requires `NodeJS`, alongside `ElectronJS`.

Install Dependencies
```SH
npm i
```

Install Electron (I use globally `-g` personally)
```SH
npm i electron -g
```

Go to the directory of the project, then launch it with Electron.
```SH
cd C:/path/to/project
electron .
```

#### Standalone (Executable)
The program comes ready out of the box. If you want to add your own commands you just need to find the appropriate `/commands/` directory, add your file `my_command.js`, and follow the command structure. Check the structure of other commands for extra options.

```
module.exports = {
  command: 'template',
  description: '',
  requiresEntity: true,
  author: 'me, myself, and irene',
  execute: function(sender, command, args) {

  }
}
```

## Configuration

#### Add Accounts
You can add accounts via the command `accounts`

#### Account Cache
Caching is handled by node-minecraft-protocol, and on most systems the folder will be in `.minecraft/nmp-cache`, however mineprompt uses its own subfolder.
