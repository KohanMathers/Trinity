const state = {
  accounts: [],
  activeAccountIndex: 0,
  client: null,
  syncState: 'stopped',
  activeRoomId: null,
  activeSpaceId: null,
  activePanel: 'members',
  rooms: new Map(),
  messages: new Map(),
  unread: new Map(),
  typing: new Map(),
};

const listeners = new Map();

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  emit('state', state);
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, data) {
  listeners.get(event)?.forEach(fn => fn(data));
}

export function getActiveAccount() {
  return state.accounts[state.activeAccountIndex] ?? null;
}

export function getUserColor(userId) {
  const palette = ['#DD5F5F', '#FF954F', '#80D35D', '#F7DA47', '#BC6DE0', '#5BB1EF'];
  let h = 0;
  for (const c of (userId ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function getRoomTheme(roomId) {
  const themes = ['blue', 'purple', 'green', 'orange', 'red', 'yellow'];
  let h = 0;
  for (const c of (roomId ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return themes[h % themes.length];
}

export function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length === 1
    ? (p[0][0] ?? '?').toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function saveAccounts() {
  try {
    localStorage.setItem('trinity_accounts', JSON.stringify(
      state.accounts.map(a => ({
        userId: a.userId, accessToken: a.accessToken,
        baseUrl: a.baseUrl, deviceId: a.deviceId,
        displayName: a.displayName, avatarUrl: a.avatarUrl, color: a.color,
      }))
    ));
    localStorage.setItem('trinity_active_account', String(state.activeAccountIndex));
  } catch { }
}

export function loadSavedAccounts() {
  try {
    const raw = localStorage.getItem('trinity_accounts');
    const idx = parseInt(localStorage.getItem('trinity_active_account') ?? '0', 10);
    if (!raw) return null;
    return { accounts: JSON.parse(raw), activeIndex: isNaN(idx) ? 0 : idx };
  } catch { return null; }
}

export function clearSavedAccounts() {
  localStorage.removeItem('trinity_accounts');
  localStorage.removeItem('trinity_active_account');
}
