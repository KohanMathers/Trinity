import { restoreSessions, logout } from './client/matrix.js';
import { on, emit } from './store/state.js';
import { renderAuthScreen } from './ui/AuthScreen.js';
import { renderApp } from './ui/App.js';

const app = document.getElementById('app');

async function boot() {
  const restored = await restoreSessions();
  if (restored) mountApp();
  else mountAuth();
}

function mountAuth() {
  app.innerHTML = '';
  app.appendChild(renderAuthScreen());
  on('auth-success', () => mountApp());
}

function mountApp() {
  app.innerHTML = '';
  app.appendChild(renderApp());
  on('logout', () => mountAuth());
}

boot();
