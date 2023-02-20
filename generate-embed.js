let glob = require('glob');
let path = require('path');

let files = glob.sync(path.join(`./commands/**/*.js`).replace(/\\/g, '/'), { cache: false });

let commands = {
  /* Generated in the for loop
  global: {},
  mineflayer: {},
  bedrock: {},
  node_minecraft_protocol: {}
  */
}

for(let a = 0; a < files.length; a++) {
  let file = files[a];
  let edition = file.split('/')[1]; // mineflayer / bedrock / node-minecraft-protocol

  if(!commands[edition]) console.log(`\n⚙ ***${edition.toUpperCase()}***\n`);
  if(!commands[edition]) commands[edition] = {}

  let command_module = require(`./${file}`);


  if(command_module.command === 'template') continue;

  let data = commands[edition][command_module.command] = {
    command: command_module.command,
    description: command_module.description || 'WARNING - This command has no description',
    usage: command_module.usage
  }

  console.log(
`⤷ ${data.command}
   > *${data.description}*
   `)

}

console.log(`> The commands listed here may be incomplete or missing from the currently released version.`)