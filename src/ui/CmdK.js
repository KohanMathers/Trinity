import { getRoomList, createSpace, getOrCreateDirectMessageRoom } from '../client/matrix.js';
import { setState } from '../store/state.js';
import { openCreateRoom } from './modals/CreateRoomModal.js';
import { openSettings } from './modals/SettingsModal.js';
import { toastError } from '../utils/toast.js';

let overlay = null;
let focusIdx = 0;

export function initCmdK() {
  overlay = document.createElement('div');
  overlay.className = 'cmdk-overlay';
  overlay.innerHTML = `
    <div class="cmdk-modal">
      <div class="cmdk-input-row">
        <span style="color:var(--text-dim);font-size:13px">⌘</span>
        <input class="cmdk-input" id="cmdk-input" placeholder="Jump to room, run command…"/>
        <span class="cmdk-esc">esc</span>
      </div>
      <div class="cmdk-results" id="cmdk-results"></div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeCmdK(); });
  overlay.querySelector('#cmdk-input').addEventListener('input', e => render(e.target.value));
  overlay.querySelector('#cmdk-input').addEventListener('keydown', e => {
    if (e.key === 'Escape')    { closeCmdK(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveFocus(-1); }
    if (e.key === 'Enter')     { e.preventDefault(); activateFocused(); }
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openCmdK(); }
  });
  document.body.appendChild(overlay);
}

export function openCmdK() {
  if (!overlay) initCmdK();
  overlay.classList.add('open');
  const input = overlay.querySelector('#cmdk-input');
  input.value = ''; render('');
  setTimeout(() => input.focus(), 40);
}

export function closeCmdK() { overlay?.classList.remove('open'); }

function render(q) {
  const results = overlay.querySelector('#cmdk-results');
  const query   = q.toLowerCase().trim();
  focusIdx = 0;
  results.innerHTML = '';

  const rooms = getRoomList()
    .filter(r => !q || r.name.toLowerCase().includes(query))
    .slice(0, 5);

  const cmds = [
    { icon:'➕', label:'Create channel',    action: () => { closeCmdK(); openCreateRoom(); } },
    { icon:'💬', label:'Start DM',          action: async () => {
      closeCmdK();
      const userId = prompt('User ID (example: @alice:matrix.org)');
      if (!userId) return;
      try {
        const roomId = await getOrCreateDirectMessageRoom(userId.trim());
        setState({ activeRoomId: roomId });
      } catch (err) {
        toastError(err.message ?? 'Could not open DM');
      }
    } },
    { icon:'🧭', label:'Create space',      action: async () => {
      closeCmdK();
      const name = prompt('Space name');
      if (!name) return;
      const res = await createSpace(name.trim(), true, '');
      if (res.ok) setState({ activeRoomId: res.roomId });
      else toastError(res.error ?? 'Could not create space');
    } },
    { icon:'👤', label:'Manage accounts',   action: () => { closeCmdK(); openSettings('accounts'); } },
    { icon:'⚙️', label:'Settings',          action: () => { closeCmdK(); openSettings(); } },
  ].filter(c => !q || c.label.toLowerCase().includes(query));

  let idx = 0;

  if (rooms.length) {
    const lbl = document.createElement('div');
    lbl.className = 'cmdk-group-label'; lbl.textContent = 'Rooms';
    results.appendChild(lbl);
    rooms.forEach(r => {
      results.appendChild(makeItem(r.isEncrypted ? '🔒' : '#', r.name, `${r.memberCount} members`, () => {
        setState({ activeRoomId: r.roomId }); closeCmdK();
      }, idx++));
    });
  }

  if (cmds.length) {
    const lbl = document.createElement('div');
    lbl.className = 'cmdk-group-label'; lbl.textContent = 'Commands';
    results.appendChild(lbl);
    cmds.forEach(c => results.appendChild(makeItem(c.icon, c.label, '', c.action, idx++)));
  }
}

function makeItem(icon, name, hint, action, index) {
  const el = document.createElement('div');
  el.className = `cmdk-item${index === 0 ? ' focused' : ''}`;
  el.dataset.index = index;
  el.innerHTML = `
    <span class="cmdk-item-icon">${icon}</span>
    <span class="cmdk-item-name">${esc(name)}</span>
    ${hint ? `<span class="cmdk-item-hint">${esc(hint)}</span>` : ''}`;
  el.addEventListener('click', action);
  el.addEventListener('mouseenter', () => setFocus(index));
  return el;
}

function moveFocus(delta) {
  const items = overlay.querySelectorAll('.cmdk-item');
  setFocus(Math.max(0, Math.min(focusIdx + delta, items.length - 1)));
}
function setFocus(i) {
  overlay.querySelectorAll('.cmdk-item').forEach((el, j) => el.classList.toggle('focused', j === i));
  focusIdx = i;
}
function activateFocused() { overlay.querySelectorAll('.cmdk-item')[focusIdx]?.click(); }
function esc(s) { return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
