'use strict';

module.exports = {
  command: 'template',
  usage: 'template',
  description: 'A minimal starting point for a connected command.',
  requires: { entity: true },

  execute(sender, command, args, context) {
    return sender.reply('[Template] Replace this response with command behavior.');
  }
};
