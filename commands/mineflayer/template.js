'use strict';

module.exports = {
  command: 'template',
  usage: 'template',
  description: 'A minimal starting point for a connected command.',
  requires: { entity: true },

  execute(sender) {
    return sender.reply('[Template] Replace this response with command behavior.');
  }
};
