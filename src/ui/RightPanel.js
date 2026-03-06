import { getRoomMembers, getOrCreateDirectMessageRoom } from '../client/matrix.js';
import { getState, on, getUserColor, getInitials, setState } from '../store/state.js';
import { showProfile } from './ProfilePopup.js';
import { hydrateMediaIn } from './media.js';
import { toastError } from '../utils/toast.js';

let ctxMenu = null;

export function renderRightPanel() {
  const el = document.createElement('div');
  el.className = 'right-panel';
  el.innerHTML = `
    <div class="panel-tabs">
      <div class="panel-tab active" data-tab="members">Members</div>
      <div class="panel-tab" data-tab="threads">Threads</div>
      <div class="panel-tab" data-tab="pins">Pins</div>
    </div>
    <div class="panel-body" id="panel-body"></div>
  `;

  let activeTab = 'members';

  el.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      render();
    });
  });

  function render() {
    const state = getState();
    const body  = el.querySelector('#panel-body');
    if (!state.activeRoomId) { body.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding-top:8px">Select a room</div>`; return; }
    if (activeTab === 'members') renderMembers(state.activeRoomId, body);
    else renderPlaceholder(body);
  }

  function renderMembers(roomId, body) {
    const members = getRoomMembers(roomId);
    const state   = getState();
    body.innerHTML = '';

    const admins  = members.filter(m => m.powerLevel >= 100);
    const mods    = members.filter(m => m.powerLevel >= 50 && m.powerLevel < 100);
    const regular = members.filter(m => m.powerLevel < 50);

    if (admins.length)  buildGroup('Admins', admins, body, state);
    if (mods.length)    buildGroup('Moderators', mods, body, state);
    if (regular.length) buildGroup(`Members — ${regular.length}`, regular, body, state);
  }

  function buildGroup(label, members, body, state) {
    const labelEl = document.createElement('div');
    labelEl.className = 'panel-section-label';
    labelEl.textContent = label;
    body.appendChild(labelEl);

    members.forEach(m => {
      const color    = getUserColor(m.userId);
      const name     = m.displayName ?? m.userId.split(':')[0].slice(1);
      const avatarUrl = m.avatarUrl ?? null;
      const isMe     = m.userId === state.accounts[state.activeAccountIndex]?.userId;

      const item = document.createElement('div');
      item.className = 'member-item';

      const avatarHtml = avatarUrl
        ? `<div class="member-avatar"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="28" data-media-h="28" alt=""/><div class="member-status-dot"></div></div>`
        : `<div class="member-avatar" style="background:${color}">${getInitials(name)}<div class="member-status-dot"></div></div>`;

      item.innerHTML = `
        ${avatarHtml}
        <div class="member-info">
          <div class="member-name">${esc(name)}${isMe ? '<span style="color:var(--text-dim);font-size:10px"> (you)</span>' : ''}</div>
          <div class="member-sub">${m.powerLevel >= 100 ? 'Admin' : m.powerLevel >= 50 ? 'Moderator' : ''}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        showProfile({ ...m, displayName: name, color, avatarUrl }, item.querySelector('.member-avatar'));
      });
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'View profile', action: () => showProfile({ ...m, displayName: name, color, avatarUrl }, item.querySelector('.member-avatar')) },
          { label: 'Message', action: async () => {
            try {
              const roomId = await getOrCreateDirectMessageRoom(m.userId);
              setState({ activeRoomId: roomId });
            } catch (err) {
              toastError(err.message ?? 'Could not open DM');
            }
          } },
          { label: 'Copy ID', action: () => navigator.clipboard?.writeText(m.userId) },
        ]);
      });

      body.appendChild(item);
    });
    hydrateMediaIn(body);
  }

  function renderPlaceholder(body) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:28px 12px;gap:8px;color:var(--text-dim);text-align:center">
        <div style="font-size:26px;opacity:0.3">🧵</div>
        <div style="font-size:12px">Coming soon</div>
      </div>`;
  }

  on('state', render);
  on('membership-changed', render);
  ensureCtxMenu();
  return el;
}

function esc(s) { return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

function ensureCtxMenu() {
  if (ctxMenu) return;
  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.display = 'none';
  document.body.appendChild(ctxMenu);
  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });
}

function showCtxMenu(x, y, items) {
  ensureCtxMenu();
  ctxMenu.innerHTML = '';
  items.forEach(({ label, action, danger }) => {
    const item = document.createElement('div');
    item.className = `ctx-item${danger ? ' danger' : ''}`;
    item.textContent = label;
    item.addEventListener('click', () => {
      Promise.resolve(action?.()).finally(() => hideCtxMenu());
    });
    ctxMenu.appendChild(item);
  });
  ctxMenu.style.display = '';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 180;
  const mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
  ctxMenu.style.top = (y + mh > vh ? y - mh : y) + 'px';
}

function hideCtxMenu() {
  if (ctxMenu) ctxMenu.style.display = 'none';
}
