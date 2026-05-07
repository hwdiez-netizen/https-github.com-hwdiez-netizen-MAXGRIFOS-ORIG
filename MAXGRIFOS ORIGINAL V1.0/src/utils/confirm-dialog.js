export function confirmDialog(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nis-confirm-overlay';
    overlay.innerHTML = `
      <div class="nis-confirm-card">
        <p class="nis-confirm-msg">${msg}</p>
        <div class="nis-confirm-actions">
          <button class="btn-primary nis-confirm-yes">Confirmar</button>
          <button class="btn-secondary nis-confirm-no">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.nis-confirm-yes').addEventListener('click', () => cleanup(true));
    overlay.querySelector('.nis-confirm-no').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}
