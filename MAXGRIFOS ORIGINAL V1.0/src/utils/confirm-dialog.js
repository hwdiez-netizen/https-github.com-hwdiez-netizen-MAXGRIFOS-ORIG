export function confirmDialog(message) {
  return new Promise((resolve) => {
    document.querySelectorAll('.mg-confirm-overlay').forEach((el) => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'mg-confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'mg-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const badge = document.createElement('div');
    badge.className = 'mg-confirm-badge';
    badge.textContent = '⚠️ Confirmación requerida';

    const text = document.createElement('p');
    text.className = 'mg-confirm-message';
    text.textContent = String(message ?? '');

    const actions = document.createElement('div');
    actions.className = 'mg-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'mg-confirm-cancel';
    cancelBtn.textContent = 'Cancelar';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'mg-confirm-ok';
    okBtn.textContent = 'OK';

    let closed = false;

    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(false);
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });

    document.addEventListener('keydown', onKeyDown);

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    dialog.appendChild(badge);
    dialog.appendChild(text);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    cancelBtn.focus();
  });
}
