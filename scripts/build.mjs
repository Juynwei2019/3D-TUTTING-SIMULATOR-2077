import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const filename = 'index.html';
const { outputFiles } = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  external: ['three', 'three/*'],
  write: false,
  charset: 'utf8',
});
const html = await readFile(filename, 'utf8');
const css = await readFile('styles/simulator.css', 'utf8');
// Prevent embedded strings/comments from ending the surrounding HTML script.
const js = outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace('<link rel="stylesheet" href="./styles/simulator.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">\n${js}</script>`);
await mkdir('dist', { recursive: true });
await writeFile(`dist/${filename}`, standalone);
console.log(`Built dist/${filename} (Three.js and Xbot still load from the original URLs)`);
