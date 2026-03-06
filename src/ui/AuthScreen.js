import { loginWithPassword } from '../client/matrix.js';
import { emit } from '../store/state.js';

export function renderAuthScreen() {
  const el = document.createElement('div');
  el.id = 'auth-screen';
  el.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">Trin<span>ity</span></div>
      <div class="auth-tagline">The Matrix client that needs a better tagline</div>
      <div class="form-field">
        <label class="form-label">Homeserver</label>
        <input class="form-input" id="auth-hs" value="matrix.org" placeholder="matrix.org"/>
      </div>
      <div class="form-field">
        <label class="form-label">Username</label>
        <input class="form-input" id="auth-user" placeholder="@you:matrix.org" autocomplete="username"/>
        <div class="form-error" id="auth-error"><span>⚠</span><span id="auth-error-text"></span></div>
      </div>
      <div class="form-field">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="auth-pass" placeholder="••••••••" autocomplete="current-password"/>
      </div>
      <button class="btn-primary" id="auth-submit">Sign in</button>
      <div style="margin-top:16px;font-size:12px;color:var(--text-dim);text-align:center;line-height:1.5">
        Don't have an account? <a href="https://app.element.io/#/register" target="_blank" style="color:var(--purple)">Register on matrix.org ↗</a>
      </div>
    </div>
  `;

  const btn     = el.querySelector('#auth-submit');
  const errEl   = el.querySelector('#auth-error');
  const errText = el.querySelector('#auth-error-text');

  async function doLogin() {
    const hs   = el.querySelector('#auth-hs').value.trim();
    const user = el.querySelector('#auth-user').value.trim();
    const pass = el.querySelector('#auth-pass').value;
    if (!hs || !user || !pass) { showErr('Fill in all fields.'); return; }
    hideErr();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    const result = await loginWithPassword(hs, user, pass);
    if (result.ok) { emit('auth-success'); }
    else { showErr(result.error); btn.disabled = false; btn.textContent = 'Sign in'; }
  }

  btn.addEventListener('click', doLogin);
  el.querySelector('#auth-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  function showErr(msg) { errText.textContent = msg; errEl.classList.add('visible'); }
  function hideErr()    { errEl.classList.remove('visible'); }

  return el;
}
