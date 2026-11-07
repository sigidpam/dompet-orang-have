import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(root, 'public/icons');
mkdirSync(iconDir, { recursive: true });

const mark = `
  <path d="M256 96 400 152v112c0 84-56 140-144 168-88-28-144-84-144-168V152Z"
        fill="none" stroke="#fbbf24" stroke-width="20" stroke-linejoin="round"/>
  <path d="M208 192h52c57 0 96 39 96 96s-39 96-96 96h-52Z"
        fill="none" stroke="#f4f4f5" stroke-width="20" stroke-linejoin="round"/>
  <path d="M208 336h34l20-26 20 16 34-46"
        fill="none" stroke="#fbbf24" stroke-width="14" stroke-linecap="round"
        stroke-linejoin="round"/>
`;

function svg(inset = 0.06) {
  const scale = 1 - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#09090b"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g>
</svg>`;
}

function render(size, file, inset) {
  const resvg = new Resvg(svg(inset), {
    fitTo: { mode: 'width', value: size },
  });
  writeFileSync(resolve(iconDir, file), resvg.render().asPng());
  console.log(`wrote icons/${file} (${size}x${size})`);
}

render(192, 'icon-192.png', 0.06);
render(512, 'icon-512.png', 0.06);
render(512, 'maskable-512.png', 0.15);
render(180, 'apple-touch-icon.png', 0.09);
render(32, 'favicon-32.png', 0.06);

writeFileSync(resolve(root, 'public/favicon.svg'), `${svg(0.04)}\n`);
console.log('wrote favicon.svg');
