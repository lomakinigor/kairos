const e = require('electron');
console.log('type:', typeof e);
console.log('keys:', Object.keys(e || {}).join(', '));
setTimeout(() => process.exit(0), 500);
