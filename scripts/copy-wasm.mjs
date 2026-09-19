import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

const sourceDirectory = resolve('wasm/build');
const targetDirectory = resolve('wasm');
const publicWasmDirectory = resolve('public/wasm');
const publicJsDirectory = resolve('public/js');
await mkdir(targetDirectory, {recursive: true});
await mkdir(publicWasmDirectory, {recursive: true});
await mkdir(publicJsDirectory, {recursive: true});
await copyFile(resolve(sourceDirectory, 'hash_engine.js'), resolve(targetDirectory, 'hash_engine.js'));
await copyFile(resolve(sourceDirectory, 'hash_engine.wasm'), resolve(targetDirectory, 'hash_engine.wasm'));
await copyFile(resolve(sourceDirectory, 'hash_engine.js'), resolve(publicWasmDirectory, 'hash_engine.js'));
await copyFile(resolve(sourceDirectory, 'hash_engine.wasm'), resolve(publicWasmDirectory, 'hash_engine.wasm'));
await copyFile(resolve('js/search-worker.js'), resolve(publicJsDirectory, 'search-worker.js'));
await copyFile(resolve('js/wasm-hash.js'), resolve(publicJsDirectory, 'wasm-hash.js'));
console.log('Copied WASM artifacts to wasm/.');
