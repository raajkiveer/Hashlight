let enginePromise;

export function initHashEngine() {
  if (!enginePromise) {
    enginePromise = import('/wasm/hash_engine.js?v=7')
      .then(({ default: createModule }) => createModule({
        locateFile: file => `/wasm/${file}?v=7`
      }))
      .then(module => ({
        module,
        calculateHash: module.cwrap('calculate_hash', 'string', ['string', 'string', 'string']),
        countCandidates: module.cwrap('count_candidates', 'string', ['string']),
        startSearch: module.cwrap('start_search', null, ['string', 'string']),
        searchStep: module.cwrap('search_step', 'number', []),
        pauseSearch: module.cwrap('pause_search', null, []),
        resumeSearch: module.cwrap('resume_search', null, []),
        stopSearch: module.cwrap('stop_search', null, []),
        getSearchResult: module.cwrap('get_search_result', 'string', [])
      }));
  }
  return enginePromise;
}

export async function wasmHash(input, algorithm = 'md5', hashType = 'string') {
  const {calculateHash} = await initHashEngine();
  const result = calculateHash(input, algorithm, hashType);
  if (result.startsWith('ERROR:')) {
    throw new Error('The selected hash options are not supported by the WASM engine.');
  }
  return result;
}

export async function startWasmSearch() {
  return initHashEngine();
}
