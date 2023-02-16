const { I18n } = require('i18n');
const path = require('path');
const i18n = new I18n();

i18n.configure({
  locales: ['en', 'ru'],
  defaultLocale: 'en',
  directory: __dirname + '/../locales', // ./resources/app.asar/locales
  autoReload: false,
  objectNotation: '.'
})