import {initHashEngine} from './wasm-hash.js?v=6';

let engine;
let timer;
let startedAt = 0;
let lastAttempts = 0;
let lastReport = 0;
let lastUiReport = 0;
let searchTotal = 0;
let scheduled = false;
let stopped = false;
let paused = false;

function report(result, total) {
  const data = JSON.parse(result);
  const reportedTotal = data.total ? String(data.total) : '';
  const effectiveTotal = reportedTotal || total;
  const now = performance.now();
  const elapsed = (now - startedAt) / 1000;
  const attempts = Number(data.attempts || 0);
  if (data.status === 'running' && now - lastUiReport < 150) return;
  if (data.status === 'running') {
    self.postMessage({
      type: 'progress',
      tested: attempts,
      attempts,
      elapsed,
      speed: (attempts - lastAttempts) / Math.max(0.001, (now - lastReport) / 1000),
      candidatesPerSec: (attempts - lastAttempts) / Math.max(0.001, (now - lastReport) / 1000),
      md5HashesPerSec: (attempts - lastAttempts) / Math.max(0.001, (now - lastReport) / 1000),
      total: effectiveTotal
    });
    lastAttempts = attempts;
    lastReport = now;
    lastUiReport = now;
  } else {
    self.postMessage({
      type: 'done',
      reason: data.reason === 'time' ? 'timeout' : data.reason === 'possibility' ? 'limit' :
        data.reason === 'user' ? 'user' : data.reason === 'match' ? 'match' : 'complete',
      tested: attempts,
      matches: data.output ? [data.output] : [],
      elapsed,
      total: effectiveTotal || String(attempts)
    });
  }
}

async function tick() {
  if (!engine || stopped || paused || scheduled) return;
  scheduled = true;
  const active = engine.searchStep();
  report(engine.getSearchResult(), searchTotal);
  scheduled = false;
  if (active && !stopped) timer = setTimeout(tick, 0);
}

self.onmessage = async event => {
  const {type, target, config} = event.data;
  if (type === 'count') {
    try {
      engine = await initHashEngine();
      const count = engine.countCandidates(event.data.countConfig);
      if (count.startsWith('ERROR:')) throw new Error(count);
      self.postMessage({type: 'countResult', count, overflow: count === 'OVERFLOW'});
      engine = null;
    } catch (error) {
      self.postMessage({type: 'error', message: error.message});
    }
  } else if (type === 'start') {
    try {
      clearTimeout(timer);
      stopped = false;
      paused = false;
      scheduled = false;
      engine = await initHashEngine();
      engine.startSearch(target, config);
      startedAt = performance.now();
      searchTotal = event.data.total || '';
      self.postMessage({type:'started'});
      lastAttempts = 0;
      lastReport = startedAt;
      lastUiReport = startedAt - 150;
      await tick();
    } catch (error) {
      self.postMessage({type: 'error', message: error.message});
    }
  } else if (type === 'pause') {
    paused = true;
    clearTimeout(timer);
    engine?.pauseSearch();
    self.postMessage({type: 'paused', tested: lastAttempts, elapsed: (performance.now() - startedAt) / 1000});
  } else if (type === 'resume') {
    paused = false;
    engine?.resumeSearch();
    await tick();
  } else if (type === 'stop') {
    stopped = true;
    clearTimeout(timer);
    engine?.stopSearch();
    if (engine) report(engine.getSearchResult(), searchTotal);
  }
};
