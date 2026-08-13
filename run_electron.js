const { spawn } = require('child_process');
const path = require('path');
const exe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
console.log('EXE:', exe);
const p = spawn(exe, ['img_test_main.js'], { cwd: __dirname });
p.stdout.on('data', d => process.stdout.write('OUT: ' + d));
p.stderr.on('data', d => process.stdout.write('ERR: ' + d));
p.on('close', c => { console.log('CLOSE', c); process.exit(0); });
setTimeout(() => { p.kill(); }, 30000);
