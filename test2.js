const fs = require('fs');
try {
  const e = require('electron');
  fs.writeFileSync('C:/Users/Lenovo/Desktop/kairos-test.txt', 
    'type: ' + typeof e + '\nkeys: ' + Object.keys(e || {}).join(', ') + '\napp: ' + (typeof e.app));
} catch(err) {
  fs.writeFileSync('C:/Users/Lenovo/Desktop/kairos-test.txt', 'ERROR: ' + err.message);
}
