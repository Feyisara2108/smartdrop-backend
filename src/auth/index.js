'use strict';

const password = require('./password');
const authService = require('./authService');

module.exports = {
  ...password,
  ...authService,
};
