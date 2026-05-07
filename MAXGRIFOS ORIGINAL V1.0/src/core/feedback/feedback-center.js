
class FeedbackCenter {
  constructor() {
    this.container = null;
    this.toasts = new Set();
  }

  mount(root) {
    if (!root) return;
    this.container = document.createElement('div');
    this.container.className = 'mg-feedback-root';
    root.appendChild(this.container);
  }

  show({ type = 'success', message = '' }) {
    if (!this.container) {
      console.warn('[FeedbackCenter] Not mounted. Fallback to console:', type, message);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `mg-feedback-toast mg-feedback-${type}`;

    const content = document.createElement('div');
    content.className = 'mg-toast-content';

    const icon = document.createElement('span');
    icon.className = 'mg-toast-icon';
    icon.textContent = this._getIcon(type);

    const messageEl = document.createElement('span');
    messageEl.className = 'mg-toast-message';
    messageEl.textContent = String(message ?? '');

    content.appendChild(icon);
    content.appendChild(messageEl);
    toast.appendChild(content);

    this.container.appendChild(toast);
    this.toasts.add(toast);

    const duration = this._getDuration(type);
    
    setTimeout(() => {
      toast.classList.add('mg-toast-exit');
      setTimeout(() => {
        toast.remove();
        this.toasts.delete(toast);
      }, 400);
    }, duration);
  }

  warn(message) {
    this.show({ type: 'warning', message });
  }

  success(message) {
    this.show({ type: 'success', message });
  }

  error(message) {
    this.show({ type: 'error', message });
  }

  clear() {
    this.toasts.forEach(t => t.remove());
    this.toasts.clear();
  }

  _getIcon(type) {
    switch (type) {
      case 'warning': return '⚠️';
      case 'error': return '🔴';
      case 'success': return '✅';
      default: return '';
    }
  }

  _getDuration(type) {
    switch (type) {
      case 'warning': return 3200;
      case 'success': return 2400;
      case 'error': return 5000;
      default: return 3000;
    }
  }
}

export const feedbackCenter = new FeedbackCenter();
