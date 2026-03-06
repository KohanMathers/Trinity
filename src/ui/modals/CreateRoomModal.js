import { createRoom } from '../../client/matrix.js';
import { setState } from '../../store/state.js';
import { toastError, toastSuccess } from '../../utils/toast.js';

let overlay = null;
let selectedParentSpaceId = null;

export function openCreateRoom({ parentSpaceId = null } = {}) {
  selectedParentSpaceId = parentSpaceId;
  if (!overlay) buildModal();
  resetForm();
  overlay.classList.add('open');
}

function closeModal() {
  overlay?.classList.remove('open');
}

function buildModal() {
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">Create a channel</div>
      <div class="modal-sub">Channels are rooms that your community can browse and join.</div>

      <div class="form-field">
        <label class="form-label">Channel name</label>
        <input class="form-input" id="cr-name" placeholder="e.g. design-talk" />
      </div>

      <div class="form-field">
        <label class="form-label">Topic <span style="color:var(--text-dim);font-weight:400">(optional)</span></label>
        <input class="form-input" id="cr-topic" placeholder="What's this room about?" />
      </div>

      <div class="form-field">
        <label class="form-label">Theme colour</label>
        <div class="color-picker-row" id="cr-color-picker">
          <div class="color-swatch selected" data-color="blue"   style="background:var(--blue)"></div>
          <div class="color-swatch"          data-color="purple" style="background:var(--purple)"></div>
          <div class="color-swatch"          data-color="green"  style="background:var(--green)"></div>
          <div class="color-swatch"          data-color="orange" style="background:var(--orange)"></div>
          <div class="color-swatch"          data-color="red"    style="background:var(--red)"></div>
          <div class="color-swatch"          data-color="yellow" style="background:var(--yellow)"></div>
        </div>
      </div>

      <div class="form-field">
        <label class="form-label" style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" id="cr-private" style="accent-color:var(--blue);width:15px;height:15px" />
          Private channel
        </label>
        <p style="font-size:12px;color:var(--text-dim);margin-top:4px;line-height:1.4;">
          Only people you invite can see and join private channels.
        </p>
      </div>

      <div class="form-error" id="cr-error" style="margin-bottom:8px">
        <span>⚠</span><span id="cr-error-text"></span>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="cr-cancel">Cancel</button>
        <button class="btn-primary" id="cr-submit" style="width:auto;padding:9px 20px">
          Create channel
        </button>
      </div>
    </div>
  `;

  overlay.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
  });

  overlay.querySelector('#cr-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.querySelector('#cr-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#cr-name').value.trim();
    const topic = overlay.querySelector('#cr-topic').value.trim();
    const isPriv = overlay.querySelector('#cr-private').checked;
    const errorEl = overlay.querySelector('#cr-error');
    const errorTx = overlay.querySelector('#cr-error-text');
    const btn = overlay.querySelector('#cr-submit');

    if (!name) {
      errorTx.textContent = 'Please enter a channel name.';
      errorEl.classList.add('visible');
      return;
    }

    errorEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating…';

    const result = await createRoom(name, isPriv, topic, selectedParentSpaceId);

    if (result.ok) {
      toastSuccess(`#${name} created!`);
      setState({ activeRoomId: result.roomId });
      closeModal();
    } else {
      errorTx.textContent = result.error;
      errorEl.classList.add('visible');
    }

    btn.disabled = false;
    btn.textContent = 'Create channel';
  });

  document.body.appendChild(overlay);
}

function resetForm() {
  if (!overlay) return;
  overlay.querySelector('#cr-name').value = '';
  overlay.querySelector('#cr-topic').value = '';
  overlay.querySelector('#cr-private').checked = false;
  overlay.querySelector('#cr-error')?.classList.remove('visible');
  overlay.querySelectorAll('.color-swatch').forEach((s, i) => s.classList.toggle('selected', i === 0));
}
