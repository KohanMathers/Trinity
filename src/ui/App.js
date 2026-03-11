import { renderSidebar } from './Sidebar.js';
import { renderChatArea } from './ChatArea.js';
import { renderRightPanel } from './RightPanel.js';
import { initCmdK } from './CmdK.js';
import { initProfilePopup } from './ProfilePopup.js';
import { initVerificationModal } from './modals/SASVerificationModal.js';

export function renderApp() {
  try {
    if (localStorage.getItem('trinity_compact') === '1') {
      document.documentElement.classList.add('compact');
    }
    const accent = localStorage.getItem('trinity_accent');
    const accentTheme = localStorage.getItem('trinity_accent_theme');
    if (accent) {
      document.documentElement.style.setProperty('--accent', accent);
      document.documentElement.style.setProperty('--purple', accent);
    }
    if (accentTheme) document.documentElement.dataset.accentTheme = accentTheme;
  } catch { }

  const el = document.createElement('div');
  el.id = 'trinity-app';

  const mobileOverlay = document.createElement('div');
  mobileOverlay.className = 'mobile-overlay';
  mobileOverlay.addEventListener('click', () => closeMobileSidebar());

  const sidebar = renderSidebar(openMobileSidebar);
  const chatArea = renderChatArea();
  const rightPanel = renderRightPanel();

  el.appendChild(mobileOverlay);
  el.appendChild(sidebar);
  el.appendChild(chatArea);
  el.appendChild(rightPanel);

  initCmdK();
  initProfilePopup();
  initVerificationModal();

  function openMobileSidebar() {
    sidebar.classList.add('mobile-open');
    mobileOverlay.classList.add('active');
  }
  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    mobileOverlay.classList.remove('active');
  }

  import('../store/state.js').then(({ on }) => {
    on('state', (s) => {
      if (s.activeRoomId && window.innerWidth <= 700) closeMobileSidebar();
    });
  });

  return el;
}
