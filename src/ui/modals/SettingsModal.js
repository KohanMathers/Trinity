import { getState, setState, getInitials, getUserColor } from '../../store/state.js';
import { switchAccount, removeAccount, loginWithPassword, updateMyProfile } from '../../client/matrix.js';
import { toastSuccess, toastError } from '../../utils/toast.js';
import { hydrateMediaIn } from '../media.js';

let overlay = null;
let activeSection = 'accounts';

export function openSettings(section = 'accounts') {
  activeSection = section;
  if (!overlay) buildModal();
  renderContent();
  overlay.classList.add('open');
}

function closeModal() { overlay?.classList.remove('open'); }

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-shrink:0">
        <div class="modal-title" style="margin-bottom:0">Settings</div>
        <button class="btn-secondary" id="settings-close" style="padding:6px 12px">✕</button>
      </div>
      <div style="display:flex;gap:14px;flex:1;min-height:0">
        <div class="settings-nav" id="settings-nav" style="width:130px;flex-shrink:0"></div>
        <div id="settings-content" style="flex:1;overflow-y:auto;min-width:0"></div>
      </div>
    </div>
  `;

  overlay.querySelector('#settings-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

const SECTIONS = [
  { id: 'accounts', icon: '👤', label: 'Accounts' },
  { id: 'appearance', icon: '🎨', label: 'Appearance' },
  { id: 'notifications', icon: '🔔', label: 'Notifications' },
  { id: 'privacy', icon: '🔐', label: 'Privacy' },
];

function renderContent() {
  const nav = overlay.querySelector('#settings-nav');
  const content = overlay.querySelector('#settings-content');

  nav.innerHTML = '';
  SECTIONS.forEach(s => {
    const item = document.createElement('div');
    item.className = `settings-nav-item${s.id === activeSection ? ' active' : ''}`;
    item.innerHTML = `<span>${s.icon}</span><span>${s.label}</span>`;
    item.addEventListener('click', () => { activeSection = s.id; renderContent(); });
    nav.appendChild(item);
  });

  content.innerHTML = '';
  if (activeSection === 'accounts') renderAccounts(content);
  if (activeSection === 'appearance') renderAppearance(content);
  if (activeSection === 'notifications') renderNotifications(content);
  if (activeSection === 'privacy') renderPrivacy(content);
}

function renderAccounts(container) {
  const state = getState();
  container.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:12px">Profile</div>`;

  const active = state.accounts[state.activeAccountIndex] ?? null;
  if (active) {
    const profileBlock = document.createElement('div');
    profileBlock.className = 'account-item';
    profileBlock.style.marginBottom = '14px';

    const currentName = active.displayName ?? active.userId.split(':')[0].slice(1);
    const activeAvatar = active.avatarUrl ?? null;
    const activeAvatarHtml = activeAvatar
      ? `<div class="account-avatar"><img data-media-src="${escAttr(activeAvatar)}" data-media-w="40" data-media-h="40" alt=""/></div>`
      : `<div class="account-avatar" style="background:${active.color ?? getUserColor(active.userId)}">${getInitials(currentName)}</div>`;

    profileBlock.innerHTML = `
      ${activeAvatarHtml}
      <div class="account-info">
        <div class="account-name">${esc(currentName)}</div>
        <div class="account-hs">${esc(active.userId)}</div>
      </div>
    `;
    container.appendChild(profileBlock);

    const profileEdit = document.createElement('div');
    profileEdit.innerHTML = `
      <div class="form-field">
        <label class="form-label">Display name</label>
        <input class="form-input" id="profile-name" value="${escAttr(currentName)}" style="background:var(--bg2)"/>
      </div>
      <div class="form-field" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <label class="form-label" style="margin:0">Avatar</label>
        <button class="btn-secondary" id="profile-avatar-btn" style="padding:6px 10px">Choose image…</button>
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:-8px;margin-bottom:12px" id="profile-avatar-file">No new file selected</div>
      <button class="btn-primary" id="profile-save-btn" style="margin-bottom:18px">Save profile</button>
      <input type="file" id="profile-avatar-input" accept="image/*" style="display:none"/>
    `;
    container.appendChild(profileEdit);

    let pickedAvatarFile = null;
    const avatarInput = profileEdit.querySelector('#profile-avatar-input');
    const avatarFileLabel = profileEdit.querySelector('#profile-avatar-file');
    profileEdit.querySelector('#profile-avatar-btn').addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', () => {
      pickedAvatarFile = avatarInput.files?.[0] ?? null;
      avatarFileLabel.textContent = pickedAvatarFile ? `Selected: ${pickedAvatarFile.name}` : 'No new file selected';
    });

    profileEdit.querySelector('#profile-save-btn').addEventListener('click', async () => {
      const displayName = profileEdit.querySelector('#profile-name').value.trim();
      const btn = profileEdit.querySelector('#profile-save-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await updateMyProfile({ displayName, avatarFile: pickedAvatarFile });
        toastSuccess('Profile updated');
        renderContent();
      } catch (err) {
        toastError(err.message ?? 'Failed to update profile');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save profile';
      }
    });
  }

  const sectionLabel = document.createElement('div');
  sectionLabel.style.cssText = 'font-size:13px;font-weight:600;margin:4px 0 12px';
  sectionLabel.textContent = 'Your Accounts';
  container.appendChild(sectionLabel);

  state.accounts.forEach((account, i) => {
    const isActive = i === state.activeAccountIndex;
    const name = account.displayName ?? account.userId.split(':')[0].slice(1);
    const hs = account.baseUrl.replace('https://', '').replace('http://', '');
    const item = document.createElement('div');
    item.className = `account-item${isActive ? ' active' : ''}`;

    const avatarUrl = account.avatarUrl ?? null;
    const avatarHtml = avatarUrl
      ? `<div class="account-avatar"><img data-media-src="${escAttr(avatarUrl)}" data-media-w="40" data-media-h="40" alt=""/></div>`
      : `<div class="account-avatar" style="background:${account.color ?? getUserColor(account.userId)}">${getInitials(name)}</div>`;

    item.innerHTML = `
      ${avatarHtml}
      <div class="account-info">
        <div class="account-name">${esc(name)}${isActive ? ' <span style="color:var(--purple);font-size:10px">● active</span>' : ''}</div>
        <div class="account-hs">${esc(hs)}</div>
      </div>
      <button class="account-remove" data-i="${i}" title="Remove account">✕</button>
    `;

    if (!isActive) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', e => {
        if (e.target.classList.contains('account-remove')) return;
        switchAccount(i);
        renderContent();
        toastSuccess(`Switched to ${name}`);
      });
    }

    item.querySelector('.account-remove').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Remove ${name}? You'll be signed out of this account.`)) return;
      await removeAccount(account.userId);
      renderContent();
    });

    container.appendChild(item);
  });

  const addSection = document.createElement('div');
  addSection.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin:18px 0 10px">Add Account</div>
    <div class="form-field">
      <label class="form-label">Homeserver</label>
      <input class="form-input" id="add-hs" placeholder="matrix.org" value="matrix.org" style="background:var(--bg2)"/>
    </div>
    <div class="form-field">
      <label class="form-label">Username</label>
      <input class="form-input" id="add-user" placeholder="@you:matrix.org" style="background:var(--bg2)"/>
    </div>
    <div class="form-field">
      <label class="form-label">Password</label>
      <input class="form-input" type="password" id="add-pass" placeholder="••••••••" style="background:var(--bg2)"/>
    </div>
    <div class="form-error" id="add-error"><span>⚠</span><span id="add-error-text"></span></div>
    <button class="btn-primary" id="add-account-btn" style="margin-top:6px">
      Add account
    </button>
  `;
  container.appendChild(addSection);

  addSection.querySelector('#add-account-btn').addEventListener('click', async () => {
    const hs = addSection.querySelector('#add-hs').value.trim();
    const user = addSection.querySelector('#add-user').value.trim();
    const pass = addSection.querySelector('#add-pass').value;
    const errEl = addSection.querySelector('#add-error');
    const errTx = addSection.querySelector('#add-error-text');
    const btn = addSection.querySelector('#add-account-btn');

    if (!hs || !user || !pass) { errTx.textContent = 'Fill in all fields.'; errEl.classList.add('visible'); return; }
    errEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';

    const result = await loginWithPassword(hs, user, pass);
    if (result.ok) {
      toastSuccess('Account added!');
      addSection.querySelector('#add-hs').value = 'matrix.org';
      addSection.querySelector('#add-user').value = '';
      addSection.querySelector('#add-pass').value = '';
      renderContent();
    } else {
      errTx.textContent = result.error;
      errEl.classList.add('visible');
    }
    btn.disabled = false;
    btn.textContent = 'Add account';
  });

  hydrateMediaIn(container);
}

function renderAppearance(container) {
  const root = document.documentElement;
  const isCompact = root.classList.contains('compact');
  const currentTheme = root.dataset.accentTheme ?? 'purple';

  container.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">Appearance</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Compact messages</div><div class="settings-row-sub">Reduce spacing between messages</div></div>
      <div class="toggle${isCompact ? ' on' : ''}" id="toggle-compact"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Show member list</div><div class="settings-row-sub">Visible on large screens by default</div></div>
      <div class="toggle on" id="toggle-members"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Colour theme</div><div class="settings-row-sub">Accent colour used throughout the app</div></div>
    </div>
    <div class="color-picker-row" style="margin-top:8px">
      <div class="color-swatch${currentTheme === 'purple' ? ' selected' : ''}" style="background:var(--purple)" data-c="purple" data-color="#9B59B6"></div>
      <div class="color-swatch${currentTheme === 'blue' ? ' selected' : ''}"   style="background:var(--blue)"   data-c="blue"   data-color="#5BB1EF"></div>
      <div class="color-swatch${currentTheme === 'green' ? ' selected' : ''}"  style="background:var(--green)"  data-c="green"  data-color="#80D35D"></div>
      <div class="color-swatch${currentTheme === 'orange' ? ' selected' : ''}" style="background:var(--orange)" data-c="orange" data-color="#FF954F"></div>
      <div class="color-swatch${currentTheme === 'red' ? ' selected' : ''}"    style="background:var(--red)"    data-c="red"    data-color="#DD5F5F"></div>
    </div>
  `;

  const compactToggle = container.querySelector('#toggle-compact');
  compactToggle.addEventListener('click', () => {
    compactToggle.classList.toggle('on');
    document.documentElement.classList.toggle('compact', compactToggle.classList.contains('on'));
    try { localStorage.setItem('trinity_compact', compactToggle.classList.contains('on') ? '1' : '0'); } catch { }
  });

  const membersToggle = container.querySelector('#toggle-members');
  membersToggle.addEventListener('click', () => {
    membersToggle.classList.toggle('on');
    const rp = document.querySelector('.right-panel');
    if (rp) rp.classList.toggle('hidden', !membersToggle.classList.contains('on'));
  });

  container.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      container.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
      const color = s.dataset.color;
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--purple', color);
      document.documentElement.dataset.accentTheme = s.dataset.c;
      try { localStorage.setItem('trinity_accent', color); localStorage.setItem('trinity_accent_theme', s.dataset.c); } catch { }
    });
  });
}

function renderNotifications(container) {
  const notifOn = localStorage.getItem('trinity_notif_desktop') === '1';
  const mentionOnly = localStorage.getItem('trinity_notif_mention_only') !== '0';
  const soundOn = localStorage.getItem('trinity_notif_sound') === '1';

  container.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">Notifications</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Desktop notifications</div><div class="settings-row-sub">Show system notifications for new messages</div></div>
      <div class="toggle${notifOn ? ' on' : ''}" id="toggle-notif"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Notify on @mention only</div></div>
      <div class="toggle${mentionOnly ? ' on' : ''}" id="toggle-mention"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Notification sound</div></div>
      <div class="toggle${soundOn ? ' on' : ''}" id="toggle-sound"></div>
    </div>
  `;

  container.querySelector('#toggle-notif').addEventListener('click', async function () {
    this.classList.toggle('on');
    if (this.classList.contains('on')) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { this.classList.remove('on'); toastError('Notification permission denied.'); return; }
    }
    try { localStorage.setItem('trinity_notif_desktop', this.classList.contains('on') ? '1' : '0'); } catch { }
  });

  container.querySelector('#toggle-mention').addEventListener('click', function () {
    this.classList.toggle('on');
    try { localStorage.setItem('trinity_notif_mention_only', this.classList.contains('on') ? '1' : '0'); } catch { }
  });

  container.querySelector('#toggle-sound').addEventListener('click', function () {
    this.classList.toggle('on');
    try { localStorage.setItem('trinity_notif_sound', this.classList.contains('on') ? '1' : '0'); } catch { }
  });
}

function renderPrivacy(container) {
  container.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">Privacy & Security</div>
    <div class="settings-row">
      <div><div class="settings-row-label">Read receipts</div><div class="settings-row-sub">Let others see when you've read messages</div></div>
      <div class="toggle on"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Typing indicators</div><div class="settings-row-sub">Show others when you're typing</div></div>
      <div class="toggle on"></div>
    </div>
    <div class="settings-row">
      <div><div class="settings-row-label">Online presence</div><div class="settings-row-sub">Show your online status to others</div></div>
      <div class="toggle on"></div>
    </div>
    <div style="margin-top:20px">
      <button class="btn-secondary" style="color:var(--red);border-color:rgba(221,95,95,0.3)"
        onclick="import('/src/client/matrix.js').then(m=>m.logout())">
        Sign out of all accounts
      </button>
    </div>
  `;
  container.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', () => t.classList.toggle('on')));
}

function esc(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
