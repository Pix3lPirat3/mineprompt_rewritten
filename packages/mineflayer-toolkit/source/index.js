'use strict';

module.exports = {
  ...require('./runtime'),
  ...require('./navigation'),
  ...require('./mining'),
  ...require('./trees'),
  ...require('./inventory'),
  ...require('./storage'),
  ...require('./builder'),
  ...require('./interactions'),
  ...require('./plugins')
};
