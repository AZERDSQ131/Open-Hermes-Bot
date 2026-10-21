const fs = require('node:fs');
const { app } = require('electron');
const log = (line) => fs.appendFileSync('/tmp/gbtest/probe.txt', line + '\n');
log('MAIN STARTED ' + app.getName() + ' ' + app.getPath('userData'));
app.whenReady().then(() => {
  log('READY');
  setTimeout(() => { log('QUIT'); app.quit(); }, 4000);
});
