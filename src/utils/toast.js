let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

export function toast(message, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type} fade-in`;

  const icons = { info: 'ℹ️', success: '✅', error: '⚠️', warning: '🟡' };
  el.innerHTML = `
    <span>${icons[type] ?? icons.info}</span>
    <span>${message}</span>
  `;

  const c = getContainer();
  c.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(8px)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export const toastError = (msg) => toast(msg, 'error');
export const toastSuccess = (msg) => toast(msg, 'success');
export const toastInfo = (msg) => toast(msg, 'info');
