/*
 * Prevents a stale local API process from blocking `pnpm dev:api`.
 * It deliberately only stops Node processes; a different application using the
 * port is reported instead of being terminated unexpectedly.
 */
const { execFileSync } = require('node:child_process');

const port = process.env.PORT ?? '3001';
if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) throw new Error(`Invalid PORT value: ${port}`);

function command(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function listenersOnWindows() {
  return [...new Set(command('netstat', ['-ano', '-p', 'tcp'])
    .split(/\r?\n/)
    .filter((line) => line.includes(`:${port}`) && line.includes('LISTENING'))
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter((pid) => /^\d+$/.test(pid)))];
}

function listenersOnUnix() {
  return [...new Set(command('lsof', ['-ti', `tcp:${port}`])
    .split(/\r?\n/)
    .filter((pid) => /^\d+$/.test(pid)))];
}

const pids = process.platform === 'win32' ? listenersOnWindows() : listenersOnUnix();
for (const pid of pids) {
  const processName = process.platform === 'win32'
    ? command('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).toLowerCase()
    : command('ps', ['-p', pid, '-o', 'comm=']).toLowerCase();
  if (!processName.includes('node')) {
    throw new Error(`El puerto ${port} está ocupado por un proceso que no es Node (PID ${pid}). Cerralo manualmente antes de iniciar la API.`);
  }
  console.info(`Liberando el puerto ${port}: cerrando la API anterior (PID ${pid}).`);
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'inherit' });
  else execFileSync('kill', ['-TERM', pid], { stdio: 'inherit' });
}
