let client;
let profile;
let adminUsers = [];
let selectedUserId = null;
const MAX_TIME_LIMIT = 3600;
const $ = selector => document.querySelector(selector);
async function getClient() {
  const env = import.meta.env || {};
  const url = env.VITE_SUPABASE_URL || globalThis.SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_ANON_KEY || globalThis.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  if (!client) {
    const {createClient} = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(url, key);
  }
  return client;
}
function show(message) { $('#auth-state').textContent = message; $('#admin-message').textContent = message; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
function formatPossibility(value) { const number = Number(value); return number < 0 ? '-' : number.toLocaleString('en-US'); }
function formatTime(value) { return `${Number(value || 0).toLocaleString('en-US')} sec`; }
function statusLabel(user) { if (user.disabled) return 'Disabled'; return (user.approval_status || 'pending').replace(/^./, char => char.toUpperCase()); }
function displayEmail(user) { return user.email || 'Email unavailable'; }
function render() {
  const actions = $('#account-actions');
  actions.hidden = !profile;
  if (!profile) { $('#premium-login').hidden = false; return; }
  $('#premium-login').hidden = true;
  actions.innerHTML = `<button class="mini-button" id="account-button">${profile.role === 'admin' ? 'Admin' : 'Premium User'}</button><button class="mini-button" id="logout-button">Logout</button>`;
  $('#logout-button').onclick = async () => { const api = await getClient(); await api?.auth.signOut(); profile = null; render(); };
  $('#account-button').onclick = () => { if (profile.role === 'admin') openDashboard(); else openAuth(); };
}
function normalizeLimit(value, fallback, minimum, maximum = Number.POSITIVE_INFINITY) {
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number) && number >= minimum
    ? Math.min(number, maximum)
    : fallback;
}
function publishLimits(limits) {
  const source = limits || {};
  globalThis.hashlightLimits = {
    timeLimit: normalizeLimit(source.timeLimit, 30, 0, MAX_TIME_LIMIT),
    possibilityLimit: normalizeLimit(source.possibilityLimit, 0, -1),
    role: source.role || null,
    safetyBypass: source.safetyBypass === true
  };
  globalThis.dispatchEvent(new CustomEvent('hashlight-limits'));
}
async function loadProfile(api, user) {
  if (!api || !user) return null;
  const {data} = await api.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}
globalThis.recordHashlightSearch = async (hashInput, output) => {
  const api = await getClient();
  if (!api || !profile || (!profile.disabled && profile.approval_status !== 'approved' && profile.role !== 'admin')) return;
  const {error} = await api.from('search_history').insert({user_id: profile.id, hash_input: hashInput, output});
  if (error) console.warn('Search history could not be saved:', error.message);
};
async function openAuth() {
  $('#auth-modal').hidden = false; $('#admin-dashboard').hidden = true; $('#auth-form').hidden = false;
  const api = await getClient(); if (!api) show('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your hosting environment.');
}
async function openDashboard() {
  $('#auth-modal').hidden = false; $('#auth-form').hidden = true; $('#admin-dashboard').hidden = false;
  const api = await getClient(); if (!api) return;
  const {data, error} = await api.from('profiles').select('id,email,role,approval_status,created_at,approved_at,disabled,time_limit,possibility_limit').in('role',['admin','premium']).order('created_at',{ascending:false});
  if (error) { show(error.message); return; }
  adminUsers = (data || []).sort((left, right) => (left.role === 'admin' ? -1 : right.role === 'admin' ? 1 : 0));
  renderAdminUsers();
  const {data: settings, error: settingsError} = await api.from('system_settings').select('non_login_time_limit,non_login_possibility_limit,non_login_enabled').eq('id', true).maybeSingle();
  if (settingsError) { console.error('Failed to load non-login settings', settingsError); show('Failed to load non-login settings. Please try again.'); return; }
  renderNonLogin(settings);
  $('#admin-user-form').onsubmit = async event => {
    event.preventDefault();
    if (!selectedUserId) return show('Select a premium user before saving.');
    const selected = adminUsers.find(item => item.id === selectedUserId);
    if ($('#admin-user-email').value.trim() !== displayEmail(selected)) return show('Email changes must be made through Supabase Auth.');
    const timeLimit = Number($('#admin-user-time').value);
    const possibilityLimit = Number($('#admin-user-possibility').value);
    if (!Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > MAX_TIME_LIMIT) return show(`Time limit must be an integer from 0 to ${MAX_TIME_LIMIT} seconds.`);
    if (!Number.isInteger(possibilityLimit) || possibilityLimit < -1) return show('Possibility limit must be an integer of -1 or greater.');
    await updateUser(selectedUserId, {approval_status: $('#admin-user-status').value, time_limit: timeLimit, possibility_limit: possibilityLimit}, 'save');
  };
}
function renderAdminUsers() {
  $('#admin-content').innerHTML = adminUsers.length ? adminUsers.map(user => `<article class="admin-user-card"><div class="user-cell user-email"><strong>${escapeHtml(displayEmail(user))}</strong></div><div class="user-cell"><span class="mobile-label">Status</span><span class="status-badge status-${user.disabled ? 'disabled' : user.approval_status}">${statusLabel(user)}</span></div><div class="user-cell"><span class="mobile-label">Time Limit</span><label class="inline-edit"><input aria-label="Time limit for ${escapeHtml(displayEmail(user))}" data-id="${user.id}" data-field="time_limit" value="${user.time_limit}" type="number" min="0" max="${MAX_TIME_LIMIT}" step="1"><span>sec</span></label></div><div class="user-cell"><span class="mobile-label">Possibility Limit</span><label class="inline-edit"><input aria-label="Possibility limit for ${escapeHtml(displayEmail(user))}" data-id="${user.id}" data-field="possibility_limit" value="${user.possibility_limit}" type="number" min="-1" step="1"><span>${formatPossibility(user.possibility_limit) === '-' ? 'unlimited' : 'max'}</span></label><small>${Number(user.possibility_limit) === 0 ? '0 = none' : formatPossibility(user.possibility_limit) === '-' ? 'unlimited' : `max ${formatPossibility(user.possibility_limit)}`}</small></div><div class="user-actions"><button data-id="${user.id}" data-action="approve" class="mini-button">Approve</button><button data-id="${user.id}" data-action="reject" class="mini-button">Reject</button><button data-id="${user.id}" data-action="disable" class="mini-button">${user.disabled ? 'Enable' : 'Disable'}</button><button data-id="${user.id}" data-action="save" class="mini-button">Save</button><button data-id="${user.id}" data-action="edit" class="mini-button">Edit</button><button data-id="${user.id}" data-action="history" class="mini-button">History</button></div></article>`).join('') : '<p class="empty-state">No premium users yet.</p>';
  $('#admin-content').querySelectorAll('button').forEach(button => button.onclick = async () => {
    const action = button.dataset.action;
    if (action === 'history') {
      const currentApi = await getClient();
      const {data: history, error} = await currentApi.from('search_history').select('hash_input,output,created_at').eq('user_id', button.dataset.id).order('created_at', {ascending: false}).limit(3);
      $('#history-panel').hidden = false;
      $('#history-content').innerHTML = error ? `<p class="empty-state">${escapeHtml(error.message)}</p>` : history?.length ? history.map(item => `<div class="history-row"><span><b>Hash</b><code>${escapeHtml(item.hash_input)}</code></span><span><b>Output</b><code>${escapeHtml(item.output)}</code></span><time>${escapeHtml(new Date(item.created_at).toLocaleString())}</time></div>`).join('') : '<p class="empty-state">No searches.</p>';
      return;
    }
    if (action === 'edit') { selectUser(button.dataset.id); return; }
    const user = adminUsers.find(item => item.id === button.dataset.id);
    const fields = $('#admin-content').querySelectorAll(`[data-id="${button.dataset.id}"]`);
    if (action === 'reject') { await deleteUser(button.dataset.id); return; }
    const update = action === 'approve' ? {approval_status: 'approved', approved_at: new Date().toISOString()} : action === 'disable' ? {disabled: !user.disabled} : action === 'save' ? {time_limit: Number([...fields].find(field => field.dataset.field === 'time_limit').value), possibility_limit: Number([...fields].find(field => field.dataset.field === 'possibility_limit').value)} : null;
    if (action === 'save' && (!Number.isInteger(update.time_limit) || update.time_limit < 0 || update.time_limit > MAX_TIME_LIMIT || !Number.isInteger(update.possibility_limit) || update.possibility_limit < -1)) return show(`Limits must be time 0-${MAX_TIME_LIMIT} seconds and possibility -1 or greater.`);
    if (update) await updateUser(button.dataset.id, update, action);
  });
}
function selectUser(id) { const user = adminUsers.find(item => item.id === id); if (!user) return; selectedUserId = id; $('#admin-user-email').value = displayEmail(user); $('#admin-user-status').value = user.approval_status; $('#admin-user-time').value = user.time_limit; $('#admin-user-possibility').value = user.possibility_limit; $('#admin-user-email').scrollIntoView({behavior: 'smooth', block: 'center'}); }
async function updateUser(id, update, action = 'update') { const api = await getClient(); const {data, error} = await api.from('profiles').update(update).eq('id', id).select('id,email,role,approval_status,disabled,time_limit,possibility_limit').maybeSingle(); if (error || !data) { console.error(`Admin ${action} failed`, error); show(`Failed to ${action} user. Please try again.`); return; } if (profile?.id === id) { profile = {...profile, ...data}; const hasPremiumAccess = (profile.role === 'admin' || profile.role === 'premium') && profile.approval_status === 'approved' && !profile.disabled; publishLimits(hasPremiumAccess ? {timeLimit: profile.time_limit, possibilityLimit: profile.possibility_limit, role: profile.role, safetyBypass: profile.role === 'admin'} : {timeLimit: 0, possibilityLimit: 0, role: profile.role, safetyBypass: false}); } await openDashboard(); }
async function deleteUser(id) { const api = await getClient(); const {data, error} = await api.functions.invoke('admin-delete-user', {body: {userId: id}}); if (error || !data?.deleted) { console.error('Admin reject/delete failed', error || data); show(`Failed to reject and delete user: ${error?.message || 'the server did not confirm deletion.'}`); return; } await openDashboard(); }
function renderNonLogin(settings) {
  const time = settings?.non_login_time_limit ?? 30;
  const possibility = settings?.non_login_possibility_limit ?? 0;
  const enabled = settings?.non_login_enabled !== false;
  $('#non-login-content').innerHTML = `<div class="non-login-card"><div class="non-login-grid"><div class="user-cell"><span class="mobile-label">Status</span><span id="non-login-status" data-enabled="${enabled}" class="status-badge status-${enabled ? 'approved' : 'disabled'}">${enabled ? 'Enabled' : 'Disabled'}</span></div><div class="user-cell"><span class="mobile-label">Time Limit</span><strong>${formatTime(time)}</strong><input id="non-login-time" type="number" min="0" max="${MAX_TIME_LIMIT}" step="1" value="${time}" ${enabled ? '' : 'disabled'}></div><div class="user-cell"><span class="mobile-label">Possibility Limit</span><strong>${formatPossibility(possibility)}</strong><input id="non-login-possibility" type="number" min="-1" step="1" value="${possibility}" ${enabled ? '' : 'disabled'}><small>${Number(possibility) === 0 ? '0 = none' : formatPossibility(possibility) === '-' ? 'unlimited' : `max ${formatPossibility(possibility)}`}</small></div><div class="user-actions"><button id="non-login-toggle" class="mini-button" type="button">${enabled ? 'Disable' : 'Enable'}</button><button id="non-login-save" class="mini-button" type="button">Save</button></div></div></div>`;
  $('#non-login-toggle').onclick = () => { const status = $('#non-login-status'); const next = status.dataset.enabled !== 'true'; status.dataset.enabled = String(next); status.className = `status-badge status-${next ? 'approved' : 'disabled'}`; status.textContent = next ? 'Enabled' : 'Disabled'; $('#non-login-toggle').textContent = next ? 'Disable' : 'Enable'; $('#non-login-time').disabled = !next; $('#non-login-possibility').disabled = !next; };
  $('#non-login-save').onclick = async () => { const api = await getClient(); if (!api) return show('Supabase is not configured.'); const enabledNow = $('#non-login-status').dataset.enabled === 'true'; const timeLimit = Number($('#non-login-time').value); const possibilityLimit = Number($('#non-login-possibility').value); if (!Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > MAX_TIME_LIMIT) return show(`Time limit must be an integer from 0 to ${MAX_TIME_LIMIT} seconds.`); if (!Number.isInteger(possibilityLimit) || possibilityLimit < -1) return show('Possibility limit must be an integer of -1 or greater.'); const {error} = await api.from('system_settings').update({non_login_enabled: enabledNow, non_login_time_limit: timeLimit, non_login_possibility_limit: possibilityLimit}).eq('id', true); if (error) { console.error('Non-login settings update failed', error); show('Failed to save non-login settings. Please try again.'); } else await openDashboard(); };
}
async function boot() {
  const api = await getClient(); if (!api) { publishLimits(); render(); return; }
  const {data, error: sessionError} = await api.auth.getSession();
  if (sessionError) { console.error('Failed to load session', sessionError); show('Session could not be loaded. Please sign in again.'); return; }
  profile = await loadProfile(api, data.session?.user);
  const {data: settings, error: settingsError} = await api.from('system_settings').select('non_login_time_limit,non_login_possibility_limit,non_login_enabled').eq('id', true).maybeSingle();
  if (settingsError) { console.error('Failed to load non-login settings', settingsError); show('Non-login settings could not be loaded.'); }
  const profileHasPremiumAccess = profile && (profile.role === 'admin' || profile.role === 'premium') && profile.approval_status === 'approved' && !profile.disabled;
  publishLimits(profileHasPremiumAccess ? {timeLimit: profile.time_limit, possibilityLimit: profile.possibility_limit, role: profile.role, safetyBypass: profile.role === 'admin'} : {timeLimit: settings?.non_login_enabled === false ? 0 : (settings?.non_login_time_limit ?? 30), possibilityLimit: settings?.non_login_enabled === false ? 0 : (settings?.non_login_possibility_limit ?? 0), role: profile?.role ?? null, safetyBypass: false});
  render();
  api.auth.onAuthStateChange(async (_event, session) => { profile = await loadProfile(api, session?.user); const hasPremiumAccess = profile && (profile.role === 'admin' || profile.role === 'premium') && profile.approval_status === 'approved' && !profile.disabled; publishLimits(hasPremiumAccess ? {timeLimit: profile.time_limit, possibilityLimit: profile.possibility_limit, role: profile.role, safetyBypass: profile.role === 'admin'} : {timeLimit: settings?.non_login_enabled === false ? 0 : (settings?.non_login_time_limit ?? 30), possibilityLimit: settings?.non_login_enabled === false ? 0 : (settings?.non_login_possibility_limit ?? 0), role: profile?.role ?? null, safetyBypass: false}); render(); if (profile?.approval_status === 'pending') show('Registered. Waiting for Admin Approval.'); });
}
$('#premium-login').onclick = openAuth;
$('#auth-close').onclick = () => { $('#auth-modal').hidden = true; };
$('#auth-login').onclick = async () => { const api = await getClient(); if (!api) return openAuth(); const {error} = await api.auth.signInWithPassword({email: $('#auth-email').value, password: $('#auth-password').value}); if (error) show(error.message); };
$('#auth-register').onclick = async () => { const api = await getClient(); if (!api) return openAuth(); const {error} = await api.auth.signUp({email: $('#auth-email').value, password: $('#auth-password').value}); if (error) show(error.message); else show('Registered. Waiting for Admin Approval within 24 hours.'); };
$('#admin-refresh').onclick = openDashboard;
$('#history-close').onclick = () => { $('#history-panel').hidden = true; };
boot();
