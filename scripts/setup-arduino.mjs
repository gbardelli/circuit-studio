// Descarga arduino-cli (release oficial) en tools/ e instala el core arduino:avr
// en un directorio de datos local al proyecto. No toca la instalación global.
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const VERSION = '1.5.1';
const root = resolve(import.meta.dirname, '..');
const tools = join(root, 'tools');
const dataDir = join(tools, 'arduino-data');
const isWin = process.platform === 'win32';
const bin = join(tools, isWin ? 'arduino-cli.exe' : 'arduino-cli');

const assets = {
  win32: `arduino-cli_${VERSION}_Windows_64bit.zip`,
  linux: `arduino-cli_${VERSION}_Linux_64bit.tar.gz`,
  darwin: process.arch === 'arm64' ? `arduino-cli_${VERSION}_macOS_ARM64.tar.gz` : `arduino-cli_${VERSION}_macOS_64bit.tar.gz`,
};

mkdirSync(tools, { recursive: true });

if (!existsSync(bin)) {
  const asset = assets[process.platform];
  if (!asset) throw new Error(`Plataforma no soportada: ${process.platform}`);
  const url = `https://github.com/arduino/arduino-cli/releases/download/v${VERSION}/${asset}`;
  console.log(`Descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida: ${res.status}`);
  const archive = join(tools, asset);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(archive));
  if (isWin) {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${archive}' -DestinationPath '${tools}'`], { stdio: 'inherit' });
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', tools], { stdio: 'inherit' });
  }
}

const config = join(tools, 'arduino-cli.yaml');
writeFileSync(config, `directories:\n  data: ${JSON.stringify(dataDir)}\n  downloads: ${JSON.stringify(join(dataDir, 'staging'))}\n  user: ${JSON.stringify(join(dataDir, 'user'))}\n`);

const run = (...args) => execFileSync(bin, ['--config-file', config, ...args], { stdio: 'inherit' });
run('core', 'update-index');
run('core', 'install', 'arduino:avr');
run('lib', 'install', 'Servo');
console.log('arduino-cli listo en', bin);
