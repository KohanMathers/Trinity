import { getInitials } from '../store/state.js';
import { hydrateMediaIn } from './media.js';
import { getOrCreateDirectMessageRoom } from '../client/matrix.js';
import { setState, getActiveAccount } from '../store/state.js';
import { toastError } from '../utils/toast.js';

let popup = null;
let ignoreNextClick = false;

export function initProfilePopup() {
  popup = document.createElement('div');
  popup.className = 'profile-popup';
  popup.innerHTML = '';
  document.body.appendChild(popup);

  document.addEventListener('click', e => {
    if (ignoreNextClick) { ignoreNextClick = false; return; }
    if (!popup.contains(e.target)) hideProfile();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideProfile();
  });
}

export function showProfile(member, anchorEl) {
  if (!popup) initProfilePopup();

  const bannerColor = member.color ?? '#BC6DE0';
  const name = member.displayName ?? member.userId;
  const initials = getInitials(name);

  const avatarHtml = member.avatarUrl
    ? `<div class="profile-big-avatar" style="border-color:var(--bg3)"><img data-media-src="${escAttr(member.avatarUrl)}" data-media-w="44" data-media-h="44" alt=""/></div>`
    : `<div class="profile-big-avatar" style="background:${member.color ?? '#BC6DE0'};border-color:var(--bg3)">${initials}</div>`;

  const role = member.powerLevel >= 100 ? '👑 Admin'
    : member.powerLevel >= 50 ? '🛡 Moderator'
      : '👤 Member';

  popup.innerHTML = `
    <div class="profile-banner" style="background:linear-gradient(135deg,${bannerColor}55,${bannerColor}22)"></div>
    <div class="profile-avatar-wrap">${avatarHtml}</div>
    <div class="profile-info">
      <div class="profile-display-name">${esc(name)}</div>
      <div class="profile-user-id">${esc(member.userId)}</div>
      <div class="profile-role-badge">${role}</div>
      <div class="profile-actions">
        <button class="profile-btn" onclick="navigator.clipboard?.writeText('${esc(member.userId)}')">Copy ID</button>
        <button class="profile-btn" id="profile-dm-btn">${member.userId === getActiveAccount()?.userId ? 'You' : 'Message'}</button>
      </div>
    </div>
  `;

  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;

  ignoreNextClick = true;
  popup.classList.add('open');
  popup.style.display = '';
  hydrateMediaIn(popup);

  const dmBtn = popup.querySelector('#profile-dm-btn');
  if (member.userId === getActiveAccount()?.userId) {
    dmBtn.disabled = true;
  } else {
    dmBtn.addEventListener('click', async () => {
      dmBtn.disabled = true;
      dmBtn.textContent = 'Opening…';
      try {
        const roomId = await getOrCreateDirectMessageRoom(member.userId);
        setState({ activeRoomId: roomId });
        hideProfile();
      } catch (err) {
        toastError(err.message ?? 'Could not open DM');
      } finally {
        dmBtn.disabled = false;
        dmBtn.textContent = 'Message';
      }
    });
  }

  requestAnimationFrame(() => {
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let left = rect.right + 8;
    let top = rect.top;
    if (left + pw > vw - 10) left = rect.left - pw - 8;
    if (top + ph > vh - 10) top = vh - ph - 10;
    if (top < 10) top = 10;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  });
}

export function hideProfile() {
  popup?.classList.remove('open');
}

function esc(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
