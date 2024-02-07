#!/usr/bin/env node
const { main } = require('../lib');
main().catch((error) => console.error('Beaver exited with error:', error));
