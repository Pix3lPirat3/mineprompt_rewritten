const glob = require("glob");
const path = require("path")

commander = {}; // TODO: Does this break anything?

commander.getFiles = function(type) {
  return glob.sync(path.join(__dirname, '/../commands/', type, '/**/*.js').replace(/\\/g, '/'))
}

commander.commands = {

}

commander.commands_array = null;

commander.setCommands = function(type) {
  commander.commands = {}
  let files = commander.getFiles(type);

  for (var a = 0; a < files.length; a++) {
    let file = files[a]
      // Delete the cached files, so all code is force-updated
    delete require.cache[require.resolve(file)];

    let command = null;
    try {
      command = require(file);
    } catch (e) {
      console.log(e)
      continue;
    }

    // Check if a command is already registered with the 'command' field
    let duplicate = commander.commands[command.command];
    if (duplicate) {
      echo(`[Warning] Duplicate command registered ("${command.command}")`)
      echo(`    Registered ${path.basename(duplicate.path)}, Ignored: ${path.basename(file)}`)
      continue;
    }
    commander.commands[command.command] = command;
    commander.commands[command.command].path = file; // Let's register a `path` field on the command object, so we can see where duplicates are


    // Settings Manager
    /*
    category: 'Inventory',
    setting: 'inventory-drop-',
    default_value: 5,
    dropdown: true,
    dropdown_options: [{ name: '', value: ''}, { name: '', value: ''}]
    type: 'dropdown', // text, number, select (dropdown)

    // text/textbox - button, checkbox, color, date, datetime-local, email, file, hidden, image, month, number, password, radio, range, reset, search, submit, tel, text, time, url, week
    input_type: 'checkbox,' // Add button support?
    min: 1
    max: 10,
    onChange: function() {
  
    }
    }
    */
    if(command.settings) {

    }

  }
  commander.commands_array = Object.values(commander.commands)
}

commander.reload = function() {
  echo('[Console] Now reloading the client..')
    // Yes we're just calling the original function, however let's keep commander.reload seperate just incase..
  commander.setCommands('mineflayer')
}

commander.setCommands('mineflayer');