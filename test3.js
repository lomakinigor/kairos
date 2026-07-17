const fs = require('fs');
fs.writeFileSync('C:/Users/Lenovo/Desktop/kairos-env.txt', 
  'ELECTRON_RUN_AS_NODE: ' + process.env.ELECTRON_RUN_AS_NODE + '\n' +
  'process.type: ' + process.type + '\n' +
  'process.versions.electron: ' + process.versions.electron + '\n' +
  'argv: ' + process.argv.join(' ')
);
