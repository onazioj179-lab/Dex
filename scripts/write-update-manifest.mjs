// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [tag, repository, assets] = process.argv.slice(2);
const parsed = /^v(\d+\.\d+\.\d+)(?:\((\d+[a-z])\))?$/.exec(tag ?? '');
if (!parsed || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !assets) {
  throw new Error('Expected a stable version tag, GitHub repository, and release assets directory.');
}
const version = parsed[1];
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
if (pkg.version !== version || config.version !== version) throw new Error('The release tag does not match the packaged DEX version.');
if (parsed[2] && pkg.dexBuild !== parsed[2]) throw new Error('The release tag does not match the packaged DEX build.');

const names = await readdir(assets);
const installers = names.filter(name => name.endsWith('-setup.exe'));
if (installers.length !== 1) throw new Error('Expected one official DEX setup executable.');
const installer = installers[0];
const signature = (await readFile(join(assets, installer + '.sig'), 'utf8')).trim();
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) throw new Error('The installer has no valid updater signature.');
const trustedComment = Buffer.from(signature, 'base64').toString('utf8').split(/\r?\n/)
  .find(line => line.startsWith('trusted comment: '));
if (!trustedComment?.split('\t').includes('version:' + version)) {
  throw new Error('The updater signature is not bound to the release version.');
}
const manifest = {
  version,
  notes: (await readFile('release-notes.md', 'utf8')).trim(),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(installer)}`,
      signature,
    },
  },
};
await writeFile(join(assets, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
