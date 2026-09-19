export const $=selector=>document.querySelector(selector);
export const $$=selector=>[...document.querySelectorAll(selector)];
export function formatNumber(value){return Number(value||0).toLocaleString('en-US')}
export function formatTime(seconds){return `${(Number(seconds)||0).toFixed(2)}s`}
export function setText(selector,value){$(selector).textContent=value}
export function showError(message){const el=$('#global-error');el.textContent=message;el.hidden=false}
export function clearError(){$('#global-error').hidden=true}
