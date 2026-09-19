import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const sourceDirectory = resolve('wasm/build');
const targetDirectory = resolve('wasm');
await mkdir(targetDirectory, {recursive: true});
await copyFile(resolve(sourceDirectory, 'hash_engine.js'), resolve(targetDirectory, 'hash_engine.js'));
await copyFile(resolve(sourceDirectory, 'hash_engine.wasm'), resolve(targetDirectory, 'hash_engine.wasm'));
console.log('Copied WASM artifacts to wasm/.');
