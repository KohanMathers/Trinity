import { on } from '../../store/state.js';

let overlay = null;

export function initVerificationModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);

  on('verification-request', (request) => showRequest(request));
}

function closeModal() {
  overlay.classList.remove('open');
  overlay.innerHTML = '';
}

function showRequest(request) {
  const who = request.otherUserId;
  const deviceId = request.otherDeviceId ? ` (${request.otherDeviceId})` : '';
  const isSelf = request.isSelfVerification;

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">Verification request</div>
      <div class="modal-sub">
        ${isSelf ? 'Another one of your devices' : escHtml(who)}${escHtml(deviceId)} wants to verify.
        Verifying confirms both devices are trusted and allows encrypted messages to be shared.
      </div>
      <div class="modal-actions" style="margin-top:8px">
        <button class="btn-secondary" id="sas-decline">Decline</button>
        <button class="btn-primary" id="sas-accept">Accept</button>
      </div>
    </div>
  `;
  overlay.classList.add('open');

  overlay.querySelector('#sas-decline').addEventListener('click', () => {
    request.cancel();
    closeModal();
  });

  overlay.querySelector('#sas-accept').addEventListener('click', async () => {
    overlay.querySelector('#sas-accept').disabled = true;
    overlay.querySelector('#sas-decline').disabled = true;
    await request.accept();
    const verifier = await request.startVerification('m.sas.v1');
    showWaiting();
    verifier.on('show_sas', (sas) => showEmojis(sas));
    verifier.on('cancel', () => showCancelled());
    verifier.verify().catch(() => {});
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) { request.cancel(); closeModal(); } });
}

function showWaiting() {
  overlay.querySelector('.modal').innerHTML = `
    <div class="modal-title">Waiting for emojis…</div>
    <div class="modal-sub">Exchanging keys with the other device.</div>
    <div class="modal-actions"><button class="btn-secondary" id="sas-cancel-wait">Cancel</button></div>
  `;
  overlay.querySelector('#sas-cancel-wait').addEventListener('click', closeModal);
}

function showEmojis(sas) {
  const emojis = sas.sas.emoji ?? [];

  overlay.querySelector('.modal').innerHTML = `
    <div class="modal-title">Verify by emoji</div>
    <div class="modal-sub">Check that the emojis below match what's shown on the other device, in the same order.</div>
    <div id="sas-emoji-grid" style="
      display:grid;
      grid-template-columns:repeat(4,1fr);
      gap:12px 8px;
      margin:20px 0;
      text-align:center;
    ">
      ${emojis.map(([emoji, name]) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <span style="font-size:32px;line-height:1">${emoji}</span>
          <span style="font-size:11px;color:var(--text-dim);text-transform:capitalize">${escHtml(name)}</span>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="sas-mismatch">They don't match</button>
      <button class="btn-primary" id="sas-confirm">They match</button>
    </div>
  `;

  overlay.querySelector('#sas-confirm').addEventListener('click', async () => {
    overlay.querySelector('#sas-confirm').disabled = true;
    overlay.querySelector('#sas-mismatch').disabled = true;
    await sas.confirm();
    showDone();
  });

  overlay.querySelector('#sas-mismatch').addEventListener('click', () => {
    sas.mismatch();
    closeModal();
  });
}

function showDone() {
  overlay.querySelector('.modal').innerHTML = `
    <div class="modal-title">Verified!</div>
    <div class="modal-sub">The device has been successfully verified. Encrypted messages will now be shared between your devices.</div>
    <div class="modal-actions"><button class="btn-primary" id="sas-done">Done</button></div>
  `;
  overlay.querySelector('#sas-done').addEventListener('click', closeModal);
}

function showCancelled() {
  overlay.querySelector('.modal').innerHTML = `
    <div class="modal-title">Verification cancelled</div>
    <div class="modal-sub">The other device cancelled the verification.</div>
    <div class="modal-actions"><button class="btn-secondary" id="sas-close">Close</button></div>
  `;
  overlay.querySelector('#sas-close').addEventListener('click', closeModal);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
