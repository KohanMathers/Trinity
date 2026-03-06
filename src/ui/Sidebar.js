import {
  getSpaces,
  getRoomsInSpace,
  getRoomsNotInAnySpace,
  getDirectRooms,
  getInvitedRooms,
  createSpace,
  inviteToRoom,
  updateRoomProfile,
  leaveRoomOrSpace,
  getOrCreateDirectMessageRoom,
  acceptRoomInvite,
  declineRoomInvite,
} from '../client/matrix.js';
import { getState, setState, on, getRoomTheme, getInitials, getUserColor, getActiveAccount } from '../store/state.js';
import { openCreateRoom } from './modals/CreateRoomModal.js';
import { openCmdK } from './CmdK.js';
import { openSettings } from './modals/SettingsModal.js';
import { toastError, toastSuccess } from '../utils/toast.js';
import { hydrateMediaIn } from './media.js';

let ctxMenu = null;

export function renderSidebar(onMobileMenuRequest) {
  const el = document.createElement('div');
  el.className = 'sidebar';

  el.innerHTML = `
    <div class="sidebar-header" id="sidebar-header">
      <span class="server-name" id="sidebar-title">Trinity</span>
      <span style="color:var(--text-dim);font-size:11px">▾</span>
    </div>
    <div class="sidebar-search" id="sidebar-search-btn">
      <span style="color:var(--text-dim);font-size:12px">🔍</span>
      <span class="hint">Find anything…</span>
      <kbd>⌘K</kbd>
    </div>
    <div class="channels-list" id="channels-list"></div>
    <div class="sidebar-footer">
      <div class="footer-user-avatar" id="footer-avatar" style="background:var(--purple)">
        <div class="status-dot online"></div>
      </div>
      <div class="footer-user-info">
        <div class="footer-username" id="footer-name">…</div>
        <div class="footer-homeserver" id="footer-hs"></div>
      </div>
      <button class="footer-btn" id="footer-settings-btn" title="Settings">⚙️</button>
    </div>
  `;

  ensureCtxMenu();

  el.querySelector('#sidebar-search-btn').addEventListener('click', () => openCmdK());
  el.querySelector('#footer-settings-btn').addEventListener('click', () => openSettings());
  el.querySelector('#footer-avatar').addEventListener('click', () => openSettings('accounts'));
  buildSpaceRail();

  function buildSpaceRail() {
    const rail = document.createElement('div');
    rail.className = 'account-rail';
    rail.id = 'space-rail';

    function refreshRail() {
      const state = getState();
      const spaces = getSpaces();
      rail.innerHTML = '';

      const home = document.createElement('div');
      home.className = `rail-avatar${!state.activeSpaceId ? ' active' : ''}`;
      home.style.background = 'var(--bg4)';
      home.title = 'All Spaces';
      home.textContent = '⌂';
      if (!state.activeSpaceId) home.innerHTML += '<div class="active-pip"></div>';
      home.addEventListener('click', () => setState({ activeSpaceId: null, activeRoomId: null }));
      home.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Show all spaces', action: () => setState({ activeSpaceId: null, activeRoomId: null }) },
          { label: 'Create space', action: () => promptCreateSpace() },
          { label: 'Start DM', action: () => promptStartDm() },
        ]);
      });
      rail.appendChild(home);

      if (spaces.length > 0) {
        const div = document.createElement('div');
        div.className = 'rail-divider';
        rail.appendChild(div);
      }

      spaces.forEach(space => {
        const isActive = state.activeSpaceId === space.roomId;
        const btn = document.createElement('div');
        btn.className = `rail-avatar${isActive ? ' active' : ''}`;
        btn.title = space.name ?? space.roomId;
        btn.style.background = getUserColor(space.roomId);
        if (space.avatarUrl) {
          btn.innerHTML = `<img data-media-src="${escAttr(space.avatarUrl)}" data-media-w="40" data-media-h="40" alt=""/>`;
        } else {
          btn.textContent = getInitials(space.name ?? 'Space');
        }
        if (isActive) btn.innerHTML += '<div class="active-pip"></div>';
        btn.addEventListener('click', () => setState({ activeSpaceId: space.roomId, activeRoomId: null }));
        btn.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          showCtxMenu(e.clientX, e.clientY, [
            { label: 'Open space', action: () => setState({ activeSpaceId: space.roomId, activeRoomId: null }) },
            { label: 'Create channel in space', action: () => openCreateRoom({ parentSpaceId: space.roomId }) },
            { label: 'Invite to space', action: () => promptInvite(space.roomId, 'space') },
            { label: 'Edit space', action: () => promptEditRoom(space.roomId, space.name, space.topic ?? '') },
            { label: 'Delete / leave space', action: () => promptLeave(space.roomId, space.name, 'space'), danger: true },
          ]);
        });
        rail.appendChild(btn);
      });

      const add = document.createElement('div');
      add.className = 'rail-add';
      add.textContent = '+';
      add.title = 'Create space';
      add.addEventListener('click', () => promptCreateSpace());
      add.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Create space', action: () => promptCreateSpace() },
          { label: 'Start DM', action: () => promptStartDm() },
        ]);
      });
      rail.appendChild(add);
      hydrateMediaIn(rail);
    }

    refreshRail();
    on('state', refreshRail);
    on('rooms-updated', refreshRail);

    const app = document.getElementById('trinity-app');
    if (app) app.insertBefore(rail, app.firstChild);
    else requestAnimationFrame(() => {
      const a = document.getElementById('trinity-app');
      if (a) a.insertBefore(rail, a.firstChild);
    });
  }

  function refreshFooter() {
    const account = getActiveAccount();
    if (!account) return;
    const name = account.displayName ?? account.userId.split(':')[0].slice(1);
    const hs = account.baseUrl.replace('https://', '').replace('http://', '');
    const avatarEl = el.querySelector('#footer-avatar');

    const avatarUrl = account.avatarUrl ?? null;
    if (avatarUrl) {
      avatarEl.innerHTML = `<img data-media-src="${escAttr(avatarUrl)}" data-media-w="40" data-media-h="40" alt=""/><div class="status-dot online"></div>`;
    } else {
      avatarEl.textContent = getInitials(name);
      avatarEl.style.background = account.color ?? getUserColor(account.userId);
      avatarEl.innerHTML += '<div class="status-dot online"></div>';
    }
    hydrateMediaIn(avatarEl);
    el.querySelector('#footer-name').textContent = name;
    el.querySelector('#footer-hs').textContent = hs;
  }

  function renderChannels() {
    const state = getState();
    const list = el.querySelector('#channels-list');
    const selectedSpaceId = state.activeSpaceId ?? null;
    const spaces = getSpaces();
    const selectedSpace = selectedSpaceId ? spaces.find(s => s.roomId === selectedSpaceId) : null;
    const orphans = selectedSpaceId ? [] : getRoomsNotInAnySpace();
    const dms = selectedSpaceId ? [] : getDirectRooms();
    const invites = selectedSpaceId ? [] : getInvitedRooms();

    const account = getActiveAccount();
    const hs = account?.baseUrl?.replace('https://', '').replace('http://', '') ?? 'Trinity';
    el.querySelector('#sidebar-title').textContent = hs;

    list.innerHTML = '';

    if (!list.dataset.ctxBound) {
      list.addEventListener('contextmenu', e => {
        if (e.target.closest('.space-header') || e.target.closest('.channel-item')) return;
        e.preventDefault();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Create channel', action: () => openCreateRoom() },
          { label: 'Create space', action: () => promptCreateSpace() },
          { label: 'Start DM', action: () => promptStartDm() },
        ]);
      });
      list.dataset.ctxBound = '1';
    }

    if (spaces.length === 0 && orphans.length === 0 && dms.length === 0 && invites.length === 0) {
      list.innerHTML = `
        <div style="padding:18px 12px;color:var(--text-dim);font-size:12px;line-height:1.6">
          No rooms yet.<br>
          <span style="color:var(--purple);cursor:pointer" id="sidebar-create-first">Create a room ↗</span><br>
          <span style="color:var(--blue);cursor:pointer" id="sidebar-create-space">Create a space ↗</span>
        </div>`;
      list.querySelector('#sidebar-create-first')?.addEventListener('click', () => openCreateRoom());
      list.querySelector('#sidebar-create-space')?.addEventListener('click', () => promptCreateSpace());
      return;
    }

    if (dms.length > 0) {
      const dmSection = document.createElement('div');
      dmSection.className = 'space-section';
      const dmHeader = document.createElement('div');
      dmHeader.className = 'space-header';
      dmHeader.innerHTML = `
        <span class="space-label">Direct Messages</span>
        <span class="space-arrow">▾</span>
        <span class="space-add-btn" title="Start DM">+</span>
      `;
      dmHeader.querySelector('.space-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        promptStartDm();
      });
      const dmWrap = document.createElement('div');
      dms.forEach(room => dmWrap.appendChild(buildRoomItem(room, state.activeRoomId)));
      let dmCollapsed = false;
      dmHeader.addEventListener('click', () => {
        dmCollapsed = !dmCollapsed;
        dmWrap.style.display = dmCollapsed ? 'none' : '';
        dmHeader.querySelector('.space-arrow').classList.toggle('collapsed', dmCollapsed);
      });
      dmHeader.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Start DM', action: () => promptStartDm() },
        ]);
      });
      dmSection.appendChild(dmHeader);
      dmSection.appendChild(dmWrap);
      list.appendChild(dmSection);
    }

    if (invites.length > 0) {
      const invSection = document.createElement('div');
      invSection.className = 'space-section';
      const invHeader = document.createElement('div');
      invHeader.className = 'space-header';
      invHeader.innerHTML = `<span class="space-label">Invites</span><span class="space-arrow">▾</span>`;
      const invWrap = document.createElement('div');
      let invCollapsed = false;
      invHeader.addEventListener('click', () => {
        invCollapsed = !invCollapsed;
        invWrap.style.display = invCollapsed ? 'none' : '';
        invHeader.querySelector('.space-arrow').classList.toggle('collapsed', invCollapsed);
      });

      invites.forEach(room => {
        const row = document.createElement('div');
        row.className = 'channel-item';
        row.innerHTML = `
          <div class="channel-icon-wrap">${room.isSpace ? '🧭' : '✉'}</div>
          <span class="channel-name">${esc(room.name)}</span>
          <button class="footer-btn" style="width:22px;height:22px" title="Accept">✓</button>
          <button class="footer-btn" style="width:22px;height:22px" title="Decline">✕</button>
        `;
        const [acceptBtn, declineBtn] = row.querySelectorAll('.footer-btn');
        acceptBtn.addEventListener('click', async e => {
          e.stopPropagation();
          try {
            const res = await acceptRoomInvite(room.roomId);
            setState({ activeRoomId: res.roomId });
          } catch (err) {
            toastError(err.message ?? 'Could not accept invite');
          }
        });
        declineBtn.addEventListener('click', async e => {
          e.stopPropagation();
          try {
            await declineRoomInvite(room.roomId);
          } catch (err) {
            toastError(err.message ?? 'Could not decline invite');
          }
        });
        invWrap.appendChild(row);
      });

      invSection.appendChild(invHeader);
      invSection.appendChild(invWrap);
      list.appendChild(invSection);
    }

    if (selectedSpace) {
      list.appendChild(buildSpaceSection(selectedSpace, getRoomsInSpace(selectedSpace.roomId), state.activeRoomId));
    } else {
      spaces.forEach(space => {
        const rooms = getRoomsInSpace(space.roomId);
        list.appendChild(buildSpaceSection(space, rooms, state.activeRoomId));
      });
    }

    if (orphans.length > 0) {
      list.appendChild(buildSpaceSection(null, orphans, state.activeRoomId));
    }
    hydrateMediaIn(list);
  }

  function buildSpaceSection(space, rooms, activeRoomId) {
    const section = document.createElement('div');
    section.className = 'space-section';

    const header = document.createElement('div');
    header.className = 'space-header';

    let avatarHtml = '';
    if (space) {
      if (space.avatarUrl) {
        avatarHtml = `<div class="space-avatar-sm"><img data-media-src="${escAttr(space.avatarUrl)}" data-media-w="16" data-media-h="16" alt=""/></div>`;
      } else {
        const color = getUserColor(space.roomId);
        avatarHtml = `<div class="space-avatar-sm" style="background:${color}">${getInitials(space.name)}</div>`;
      }
    }

    header.innerHTML = `
      ${avatarHtml}
      <span class="space-label">${esc(space ? space.name : 'Rooms')}</span>
      <span class="space-arrow">▾</span>
      <span class="space-add-btn" title="Create channel">+</span>
    `;

    header.querySelector('.space-add-btn').addEventListener('click', e => {
      e.stopPropagation();
      openCreateRoom(space ? { parentSpaceId: space.roomId } : {});
    });

    header.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!space) {
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Create channel', action: () => openCreateRoom() },
          { label: 'Create space', action: () => promptCreateSpace() },
          { label: 'Start DM', action: () => promptStartDm() },
        ]);
        return;
      }
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Create channel in space', action: () => openCreateRoom({ parentSpaceId: space.roomId }) },
        { label: 'Invite to space', action: () => promptInvite(space.roomId, 'space') },
        { label: 'Edit space', action: () => promptEditRoom(space.roomId, space.name, space.topic ?? '') },
        { label: 'Change space avatar', action: () => promptAvatarUpdate(space.roomId, 'space') },
        { label: 'Delete / leave space', action: () => promptLeave(space.roomId, space.name, 'space'), danger: true },
      ]);
    });

    let collapsed = false;
    const itemsWrap = document.createElement('div');

    header.addEventListener('click', () => {
      collapsed = !collapsed;
      itemsWrap.style.display = collapsed ? 'none' : '';
      header.querySelector('.space-arrow').classList.toggle('collapsed', collapsed);
    });

    rooms.forEach(room => {
      itemsWrap.appendChild(buildRoomItem(room, activeRoomId));
    });

    section.appendChild(header);
    section.appendChild(itemsWrap);
    return section;
  }

  function buildRoomItem(room, activeRoomId) {
    const item = document.createElement('div');
    const theme = getRoomTheme(room.roomId);
    item.className = `channel-item${room.roomId === activeRoomId ? ' active' : ''}`;
    item.dataset.theme = theme;
    item.dataset.roomId = room.roomId;

    let iconHtml = '';
    if (room.avatarUrl) {
      iconHtml = `<div class="channel-icon-wrap"><img data-media-src="${escAttr(room.avatarUrl)}" data-media-w="16" data-media-h="16" alt=""/></div>`;
    } else {
      iconHtml = `<div class="channel-icon-wrap">${room.isEncrypted ? '🔒' : '#'}</div>`;
    }

    const badge = room.unreadCount > 0
      ? `<span class="channel-badge">${room.unreadCount}</span>` : '';

    item.innerHTML = `${iconHtml}<span class="channel-name">${esc(room.name)}</span>${badge}`;
    item.addEventListener('click', () => setState({ activeRoomId: room.roomId }));
    item.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Invite to room', action: () => promptInvite(room.roomId, 'room') },
        { label: 'Edit room', action: () => promptEditRoom(room.roomId, room.name, room.topic ?? '') },
        { label: 'Change room avatar', action: () => promptAvatarUpdate(room.roomId, 'room') },
        { label: 'Delete / leave room', action: () => promptLeave(room.roomId, room.name, 'room'), danger: true },
      ]);
    });
    return item;
  }

  async function promptCreateSpace() {
    const name = prompt('Space name');
    if (!name) return;
    const topic = prompt('Space topic (optional)') ?? '';
    try {
      const res = await createSpace(name.trim(), true, topic.trim());
      if (!res.ok) throw new Error(res.error ?? 'Could not create space');
      toastSuccess('Space created');
      setState({ activeRoomId: res.roomId });
    } catch (err) {
      toastError(err.message ?? 'Could not create space');
    }
  }

  async function promptStartDm() {
    const userId = prompt('User ID (example: @alice:matrix.org)');
    if (!userId) return;
    try {
      const roomId = await getOrCreateDirectMessageRoom(userId.trim());
      setState({ activeRoomId: roomId });
    } catch (err) {
      toastError(err.message ?? 'Could not open DM');
    }
  }

  async function promptInvite(roomId, kind) {
    const userId = prompt(`Invite user ID to this ${kind} (example: @alice:matrix.org)`);
    if (!userId) return;
    try {
      await inviteToRoom(roomId, userId.trim());
      toastSuccess(`Invited ${userId}`);
    } catch (err) {
      toastError(err.message ?? 'Invite failed');
    }
  }

  async function promptEditRoom(roomId, currentName, currentTopic) {
    const name = prompt('Name', currentName ?? '') ?? null;
    if (name === null) return;
    const topic = prompt('Topic (optional)', currentTopic ?? '') ?? null;
    if (topic === null) return;
    try {
      await updateRoomProfile(roomId, { name: name.trim(), topic: topic.trim() });
      toastSuccess('Updated');
    } catch (err) {
      toastError(err.message ?? 'Update failed');
    }
  }

  async function promptAvatarUpdate(roomId, kind) {
    const file = await pickImageFile();
    if (!file) return;
    try {
      await updateRoomProfile(roomId, { avatarFile: file });
      toastSuccess(`${kind[0].toUpperCase()}${kind.slice(1)} avatar updated`);
    } catch (err) {
      toastError(err.message ?? 'Avatar update failed');
    }
  }

  async function promptLeave(roomId, name, kind) {
    if (!confirm(`Leave ${kind} \"${name}\"?`)) return;
    try {
      await leaveRoomOrSpace(roomId);
      toastSuccess(`${kind[0].toUpperCase()}${kind.slice(1)} removed`);
    } catch (err) {
      toastError(err.message ?? 'Could not leave');
    }
  }

  on('state', () => { renderChannels(); refreshFooter(); });
  on('rooms-updated', () => renderChannels());

  setTimeout(() => { renderChannels(); refreshFooter(); }, 50);

  return el;
}

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
      action();
      hideCtxMenu();
    });
    ctxMenu.appendChild(item);
  });

  ctxMenu.style.display = '';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 220;
  const mh = ctxMenu.offsetHeight;
  ctxMenu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
  ctxMenu.style.top = (y + mh > vh ? y - mh : y) + 'px';
}

function hideCtxMenu() {
  if (ctxMenu) ctxMenu.style.display = 'none';
}

function pickImageFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.click();
  });
}

function esc(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
