const { spawn } = require('child_process');
const path = require('path');
// 用 electron 的 exe 直接加载测试脚本（作为 main 传入）
const exe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const p = spawn(exe, [path.join(__dirname, 'img_test_main.js')], { cwd: __dirname });
p.stdout.on('data', d => process.stdout.write(String(d)));
p.stderr.on('data', d => process.stdout.write(String(d)));
p.on('close', c => process.exit(0));
setTimeout(() => { try{p.kill();}catch(e){} process.exit(0); }, 30000);
