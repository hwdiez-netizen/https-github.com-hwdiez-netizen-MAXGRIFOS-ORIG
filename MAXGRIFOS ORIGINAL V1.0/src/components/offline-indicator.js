import { eventBus, Events } from '../events/domain-events.js';
import { getOutboxStats, createUpdateSafetyBackup } from '../db/local-db.js';

const BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';

async function forceUpdate() {
  try {
    const backupOk = await createUpdateSafetyBackup();
    if (!backupOk) {
      alert('No se pudo crear backup automatico. Actualizacion bloqueada por seguridad.');
      return;
    }
    const pwaApi = window.__MAXGRIFOS_PWA__;
    if (pwaApi?.checkForUpdate) {
      const result = await pwaApi.checkForUpdate({ apply: true });
      if (result?.status === 'applying') {
        alert('Actualizacion aplicada. Recargando...');
        return;
      }
      if (result?.status === 'up_to_date') {
        alert('Ya estas en la ultima version.');
        return;
      }
      if (result?.status === 'available') {
        alert('Version nueva detectada, aplicando actualizacion...');
        return;
      }
      if (result?.status === 'behind') {
        alert('Version nueva detectada, cierra y reabre la app para aplicar.');
        return;
      }
      if (result?.status === 'error') {
        alert(result.message || 'Error verificando actualizacion.');
        return;
      }
      return;
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    }
  } catch (error) {
    console.warn('[OfflineIndicator] Error solicitando actualizacion', error?.message ?? String(error));
    alert('No se pudo verificar la actualizacion. Revisa conexion e intenta de nuevo.');
  }
}

export class OfflineIndicator {
  constructor(container) {
    this.container = container;
    this._online = navigator.onLine;
    this._pendingCount = 0;
    this._failedCount = 0;
    this._byDomain = [];
    this._lastSyncIssue = null;
    this._lastSyncRecovery = null;
    this._consistencyStatus = 'unknown';
    this._consistencyIssueCount = 0;
    this._consistencyCriticalCount = 0;
    this._consistencyWarningCount = 0;
    this._consistencyCheckedAt = null;
    this._consistencySource = 'startup';
    this._consistencyTopIssue = null;
    this._observabilityStatus = 'unknown';
    this._observabilitySource = 'startup';
    this._observabilityLastEventId = null;
    this._observabilityLastEventType = null;
    this._observabilityLastEventAt = null;
    this._observabilityLastAggregateId = null;
    this._observabilityEventsPerMinute = 0;
    this._observabilityBufferedEvents = 0;
    this._observabilityLastSyncEventId = null;
    this._observabilityLastSyncStatus = null;
    this._observabilityLastSyncEntity = null;
    this._operationalAlerts = [];
    this._dbWarningShown = false;
    this._showMenu = false;
    this._pwaInstallAvailable = false;
    this._pwaUpdateAvailable = false;
    this._pwaInstalling = false;
    this._pwaInstalled = false;
    this._pwaLocalBuildId = BUILD;
    this._pwaRemoteBuildId = null;
    this._pwaVersionBehind = false;
  }

  mount() {
    this._refresh();
    this._capturePwaState(window.__MAXGRIFOS_PWA__?.getState?.() ?? {});
    window.addEventListener('online', () => {
      this._online = true;
      this._refresh();
    });
    window.addEventListener('offline', () => {
      this._online = false;
      this._refresh();
    });
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target) && this._showMenu) {
        this._showMenu = false;
        this._render();
      }
    });
    eventBus.on(Events.PRODUCT_CREATED, () => this._refresh());
    eventBus.on(Events.SYNC_STATUS_CHANGED, ({ payload }) => {
      this._captureSyncSignal(payload ?? {});
      this._refresh();
    });
    eventBus.on(Events.CONSISTENCY_STATUS_CHANGED, ({ payload }) => {
      this._captureConsistencySignal(payload ?? {});
      this._render();
    });
    eventBus.on(Events.OBSERVABILITY_STATUS_CHANGED, ({ payload }) => {
      this._captureObservabilitySignal(payload ?? {});
      this._render();
    });
    window.addEventListener('maxgrifos:pwa-state', ({ detail }) => {
      this._capturePwaState(detail ?? {});
      this._render();
    });
  }

  async _refresh() {
    try {
      const stats = await getOutboxStats();
      this._pendingCount = stats.pending;
      this._failedCount = stats.failed;
      this._byDomain = stats.byDomain ?? [];
    } catch (error) {
      if (!this._dbWarningShown) {
        this._dbWarningShown = true;
        console.warn('[OfflineIndicator] No fue posible leer outbox stats', error?.message ?? String(error));
      }
    }
    this._render();
  }

  _formatTs(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  _captureSyncSignal(payload = {}) {
    const id = payload?.id ?? 'N/A';
    const entity = payload?.entity ?? 'sync';
    const status = payload?.status ?? null;
    const source = payload?.source ?? 'unknown';
    const retryCount = Number(payload?.retry_count ?? 0);
    const maxRetries = Number(payload?.max_retries ?? 0);
    const error = typeof payload?.error === 'string' ? payload.error.trim() : '';
    const timestamp = new Date().toISOString();

    if (status === 'error' || (status === 'pending' && error.length > 0)) {
      this._lastSyncIssue = {
        id,
        entity,
        source,
        status,
        error: error || 'Error de sincronizacion sin mensaje',
        retry_count: retryCount,
        max_retries: maxRetries,
        at: timestamp,
      };
      return;
    }

    if (status === 'synced') {
      const hasRecoverySignal = Boolean(payload?.recovered)
        || retryCount > 0
        || (this._lastSyncIssue?.id === id && this._lastSyncIssue?.entity === entity);
      if (hasRecoverySignal) {
        this._lastSyncRecovery = {
          id,
          entity,
          source,
          retry_count: retryCount,
          at: timestamp,
        };
      }
    }
  }

  _captureConsistencySignal(payload = {}) {
    this._consistencyStatus = String(payload?.status ?? 'unknown');
    this._consistencyIssueCount = Number(payload?.issue_count ?? 0);
    this._consistencyCriticalCount = Number(payload?.critical_count ?? 0);
    this._consistencyWarningCount = Number(payload?.warning_count ?? 0);
    this._consistencyCheckedAt = payload?.checked_at ?? new Date().toISOString();
    this._consistencySource = String(payload?.source ?? 'unknown');

    const issues = Array.isArray(payload?.issues) ? payload.issues : [];
    const top = issues[0] ?? null;
    if (!top) {
      this._consistencyTopIssue = null;
      return;
    }
    this._consistencyTopIssue = {
      code: String(top.code ?? 'UNKNOWN'),
      entity: String(top.entity ?? 'system'),
      reference: String(top.reference ?? '-'),
      message: String(top.message ?? 'Inconsistencia sin detalle'),
      severity: String(top.severity ?? 'warning'),
      detected_at: top.detected_at ?? this._consistencyCheckedAt,
    };
  }

  _captureObservabilitySignal(payload = {}) {
    this._observabilityStatus = String(payload?.status ?? 'unknown');
    this._observabilitySource = String(payload?.source ?? 'unknown');
    this._observabilityLastEventId = payload?.last_event_id ?? null;
    this._observabilityLastEventType = payload?.last_event_type ?? null;
    this._observabilityLastEventAt = payload?.last_event_timestamp ?? payload?.checked_at ?? null;
    this._observabilityLastAggregateId = payload?.last_event_aggregate_id ?? null;
    this._observabilityEventsPerMinute = Number(payload?.events_last_minute ?? 0);
    this._observabilityBufferedEvents = Number(payload?.buffered_events ?? 0);
    this._observabilityLastSyncEventId = payload?.last_sync_event_id ?? null;
    this._observabilityLastSyncStatus = payload?.last_sync_status ?? null;
    this._observabilityLastSyncEntity = payload?.last_sync_entity ?? null;
  }

  _capturePwaState(payload = {}) {
    this._pwaInstallAvailable = Boolean(payload.installAvailable);
    this._pwaUpdateAvailable = Boolean(payload.updateAvailable);
    this._pwaInstalling = Boolean(payload.installing);
    this._pwaInstalled = Boolean(payload.appInstalled);
    this._pwaLocalBuildId = payload.localBuildId ?? this._pwaLocalBuildId ?? BUILD;
    this._pwaRemoteBuildId = payload.remoteBuildId ?? this._pwaRemoteBuildId ?? null;
    this._pwaVersionBehind = Boolean(payload.isVersionBehind);
  }

  _buildOperationalAlerts() {
    const alerts = [];

    if (!this._online) {
      alerts.push({
        severity: 'critical',
        title: 'Sin conexion',
        message: 'Operacion offline activa: los cambios quedan en cola local hasta recuperar red.',
        source: 'network',
        at: new Date().toISOString(),
      });
    }

    if (this._failedCount > 0) {
      alerts.push({
        severity: 'critical',
        title: 'Errores de sincronizacion',
        message: `Hay ${this._failedCount} item(s) en estado error dentro de outbox.`,
        source: 'sync_outbox',
        at: this._lastSyncIssue?.at ?? new Date().toISOString(),
      });
    }

    if (this._online && this._pendingCount > 0 && this._failedCount === 0) {
      alerts.push({
        severity: 'warning',
        title: 'Pendientes de sincronizar',
        message: `Hay ${this._pendingCount} item(s) pendientes sin error activo.`,
        source: 'sync_outbox',
        at: new Date().toISOString(),
      });
    }

    if (this._consistencyCriticalCount > 0) {
      alerts.push({
        severity: 'critical',
        title: 'Inconsistencia critica',
        message: `Se detectaron ${this._consistencyCriticalCount} inconsistencia(s) critica(s) cross-modulo.`,
        source: this._consistencySource || 'consistency',
        at: this._consistencyCheckedAt ?? new Date().toISOString(),
      });
    } else if (this._consistencyWarningCount > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Advertencias de consistencia',
        message: `Se detectaron ${this._consistencyWarningCount} advertencia(s) de consistencia.`,
        source: this._consistencySource || 'consistency',
        at: this._consistencyCheckedAt ?? new Date().toISOString(),
      });
    }

    if (!this._observabilityLastEventId) {
      alerts.push({
        severity: 'info',
        title: 'Trazabilidad iniciando',
        message: 'Aun no hay eventos recientes capturados por el runtime de observabilidad.',
        source: this._observabilitySource || 'observability',
        at: this._observabilityLastEventAt ?? new Date().toISOString(),
      });
    }

    this._operationalAlerts = alerts.slice(0, 6);
    return this._operationalAlerts;
  }

  _alertStyle(severity) {
    if (severity === 'critical') {
      return { tagBg: '#fef2f2', tagColor: '#991b1b', boxBg: '#fff7f7', boxBorder: '#fecaca' };
    }
    if (severity === 'warning') {
      return { tagBg: '#fffbeb', tagColor: '#92400e', boxBg: '#fffdf5', boxBorder: '#fde68a' };
    }
    return { tagBg: '#eff6ff', tagColor: '#1e3a8a', boxBg: '#f8fbff', boxBorder: '#bfdbfe' };
  }

  _render() {
    let icon;
    let label;
    let cls;
    const hasCriticalConsistency = this._consistencyCriticalCount > 0;
    const hasAnyConsistencyIssue = this._consistencyIssueCount > 0;
    const operationalAlerts = this._buildOperationalAlerts();

    if (!this._online) {
      // AUDIT-FAILED-20260425T0117Z Fix 5 (EXCEPCIÓN §1.1):
      // offline_state_black_enabled: ⚫ cuando sin red y sin errores de sync.
      // 🔴 se reserva SOLO para errores reales de sincronización.
      const blackEnabled = window.__MAXGRIFOS_FLAGS__?.offline_state_black_enabled;
      if (blackEnabled && this._failedCount === 0 && this._pendingCount === 0) {
        icon = '⚫';
        label = 'Sin red';
        cls = 'offline-disconnected';
      } else {
        icon = '🔴';
        label = this._failedCount > 0 ? `${this._failedCount} error${this._failedCount > 1 ? 'es' : ''} sync` : 'Sin conexion';
        cls = 'offline-error';
      }
    } else if (this._failedCount > 0) {
      icon = '🔴';
      label = `${this._failedCount} error${this._failedCount > 1 ? 'es' : ''} sync`;
      cls = 'offline-error';
    } else if (hasCriticalConsistency) {
      icon = '🔴';
      label = `${this._consistencyCriticalCount} inconsistencia${this._consistencyCriticalCount > 1 ? 's' : ''}`;
      cls = 'offline-error';
    } else if (this._pendingCount > 0) {
      icon = '🟡';
      label = `${this._pendingCount} pendiente${this._pendingCount > 1 ? 's' : ''}`;
      cls = 'offline-pending';
    } else if (hasAnyConsistencyIssue) {
      icon = '🟡';
      label = `${this._consistencyIssueCount} alerta${this._consistencyIssueCount > 1 ? 's' : ''} consistencia`;
      cls = 'offline-pending';
    } else {
      icon = '🟢';
      label = 'Conectado';
      cls = 'offline-ok';
    }

    this.container.innerHTML = `
      <div style="position:relative;display:inline-block">
        <button id="oi-badge" class="offline-indicator ${cls}" role="status" aria-live="polite"
          style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:20px"
          title="v${BUILD} - toca para actualizar">
          <span>${icon}</span>
          <span>${label}</span>
          <span style="font-size:10px;opacity:0.7;margin-left:2px">v${BUILD}</span>
        </button>
        ${this._showMenu ? `
          <div style="position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.18);z-index:999;min-width:240px;overflow:hidden">
            <div style="padding:8px 14px;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6">Version: <strong>${BUILD}</strong></div>
            ${this._pwaVersionBehind ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:#fff7ed">
                <div style="font-size:11px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Actualizacion pendiente</div>
                <div style="font-size:12px;color:#7c2d12;line-height:1.35;margin-top:4px">
                  Local: <strong>${this._pwaLocalBuildId || BUILD}</strong> | Remota: <strong>${this._pwaRemoteBuildId || '-'}</strong>
                </div>
                <div style="font-size:12px;color:#7c2d12;line-height:1.35">Hay una version nueva pendiente de aplicar.</div>
              </div>` : ''}
            ${this._byDomain.length > 0 ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6">
                <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Cola de sincronizacion</div>
                ${this._byDomain.map((d) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:12px">
                    <span style="color:#374151">${d.label}</span>
                    <span style="display:flex;gap:6px">
                      ${d.pending > 0 ? `<span style="color:#b45309;font-weight:600">🟡 ${d.pending}</span>` : ''}
                      ${d.failed > 0 ? `<span style="color:#dc2626;font-weight:600">🔴 ${d.failed}</span>` : ''}
                    </span>
                  </div>`).join('')}
              </div>` : ''}
            <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:#f9fafb">
              <div style="font-size:11px;color:#374151;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Dashboard operativo</div>
              <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
                  <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Sync</div>
                  <div style="font-size:12px;color:#111827;font-weight:700">Err ${this._failedCount} | Pen ${this._pendingCount}</div>
                </div>
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
                  <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Consistencia</div>
                  <div style="font-size:12px;color:#111827;font-weight:700">Crit ${this._consistencyCriticalCount} | Warn ${this._consistencyWarningCount}</div>
                </div>
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
                  <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Eventos/min</div>
                  <div style="font-size:12px;color:#111827;font-weight:700">${this._observabilityEventsPerMinute}</div>
                </div>
                <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
                  <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">Ultimo event_id</div>
                  <div style="font-size:12px;color:#111827;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._observabilityLastEventId || '-'}</div>
                </div>
              </div>
            </div>
            <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6">
              <div style="font-size:11px;color:#374151;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Alertas operativas</div>
              ${operationalAlerts.length > 0 ? operationalAlerts.map((alert) => {
                const style = this._alertStyle(alert.severity);
                return `
                  <div style="background:${style.boxBg};border:1px solid ${style.boxBorder};border-radius:8px;padding:8px;margin-bottom:6px">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                      <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:${style.tagBg};color:${style.tagColor};padding:2px 6px;border-radius:999px">${alert.severity}</span>
                      <span style="font-size:10px;color:#6b7280">${this._formatTs(alert.at)}</span>
                    </div>
                    <div style="font-size:12px;color:#111827;font-weight:700;margin-top:4px">${alert.title}</div>
                    <div style="font-size:12px;color:#374151;line-height:1.3">${alert.message}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:4px">Fuente: ${alert.source}</div>
                  </div>`;
              }).join('') : `<div style="font-size:12px;color:#166534;background:#ecfdf3;border:1px solid #bbf7d0;border-radius:8px;padding:8px">Sin alertas activas.</div>`}
            </div>
            ${this._lastSyncIssue ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:#fef2f2">
                <div style="font-size:11px;color:#991b1b;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Ultimo error sync</div>
                <div style="font-size:12px;color:#7f1d1d;line-height:1.3"><strong>${this._lastSyncIssue.entity}</strong> - ${this._lastSyncIssue.id}</div>
                <div style="font-size:12px;color:#7f1d1d;line-height:1.3">${this._lastSyncIssue.error}</div>
                <div style="font-size:11px;color:#991b1b;opacity:0.85;margin-top:4px">Origen: ${this._lastSyncIssue.source} - Reintentos: ${this._lastSyncIssue.retry_count}/${this._lastSyncIssue.max_retries || '-'}</div>
                <div style="font-size:11px;color:#991b1b;opacity:0.85">${this._formatTs(this._lastSyncIssue.at)}</div>
              </div>` : ''}
            ${this._lastSyncRecovery ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:#ecfdf3">
                <div style="font-size:11px;color:#166534;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Ultima recuperacion</div>
                <div style="font-size:12px;color:#14532d;line-height:1.3"><strong>${this._lastSyncRecovery.entity}</strong> - ${this._lastSyncRecovery.id}</div>
                <div style="font-size:11px;color:#166534;opacity:0.85;margin-top:4px">Origen: ${this._lastSyncRecovery.source} - Reintentos previos: ${this._lastSyncRecovery.retry_count}</div>
                <div style="font-size:11px;color:#166534;opacity:0.85">${this._formatTs(this._lastSyncRecovery.at)}</div>
              </div>` : ''}
            ${this._consistencyIssueCount > 0 ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:${this._consistencyCriticalCount > 0 ? '#fef2f2' : '#fffbeb'}">
                <div style="font-size:11px;color:${this._consistencyCriticalCount > 0 ? '#991b1b' : '#92400e'};margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Consistencia global</div>
                <div style="font-size:12px;color:${this._consistencyCriticalCount > 0 ? '#7f1d1d' : '#78350f'};line-height:1.3">
                  ${this._consistencyIssueCount} inconsistencia${this._consistencyIssueCount > 1 ? 's' : ''} (${this._consistencyCriticalCount} critica${this._consistencyCriticalCount !== 1 ? 's' : ''}, ${this._consistencyWarningCount} advertencia${this._consistencyWarningCount !== 1 ? 's' : ''})
                </div>
                ${this._consistencyTopIssue ? `
                  <div style="font-size:12px;color:${this._consistencyCriticalCount > 0 ? '#7f1d1d' : '#78350f'};line-height:1.3;margin-top:4px">
                    <strong>${this._consistencyTopIssue.code}</strong> - ${this._consistencyTopIssue.entity}/${this._consistencyTopIssue.reference}
                  </div>
                  <div style="font-size:12px;color:${this._consistencyCriticalCount > 0 ? '#7f1d1d' : '#78350f'};line-height:1.3">${this._consistencyTopIssue.message}</div>
                ` : ''}
                <div style="font-size:11px;color:${this._consistencyCriticalCount > 0 ? '#991b1b' : '#92400e'};opacity:0.85;margin-top:4px">Origen: ${this._consistencySource} - Ultimo check: ${this._formatTs(this._consistencyCheckedAt)}</div>
              </div>` : ''}
            ${this._observabilityLastEventId ? `
              <div style="padding:8px 14px;border-bottom:1px solid #f3f4f6;background:#eff6ff">
                <div style="font-size:11px;color:#1e3a8a;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Observabilidad E2E</div>
                <div style="font-size:12px;color:#1e3a8a;line-height:1.3"><strong>Event ID:</strong> ${this._observabilityLastEventId}</div>
                <div style="font-size:12px;color:#1e3a8a;line-height:1.3"><strong>Tipo:</strong> ${this._observabilityLastEventType || '-'}</div>
                <div style="font-size:12px;color:#1e3a8a;line-height:1.3"><strong>Aggregate:</strong> ${this._observabilityLastAggregateId || '-'}</div>
                <div style="font-size:11px;color:#1e3a8a;opacity:0.9;margin-top:4px">Eventos/min: ${this._observabilityEventsPerMinute} - Buffer: ${this._observabilityBufferedEvents}</div>
                <div style="font-size:11px;color:#1e3a8a;opacity:0.9">Ultimo sync: ${this._observabilityLastSyncEntity || '-'} / ${this._observabilityLastSyncStatus || '-'} (${this._observabilityLastSyncEventId || '-'})</div>
                <div style="font-size:11px;color:#1e3a8a;opacity:0.9">Origen: ${this._observabilitySource} - ${this._formatTs(this._observabilityLastEventAt)}</div>
              </div>` : ''}
            <div style="padding:10px 14px;border-top:1px solid #f3f4f6;display:flex;gap:8px;flex-wrap:wrap">
              <button id="oi-install-app" style="flex:1;min-width:140px;background:${this._pwaInstallAvailable ? '#065f46' : '#d1d5db'};color:#fff;border:none;padding:10px 12px;border-radius:8px;font-size:13px;cursor:${this._pwaInstallAvailable ? 'pointer' : 'not-allowed'};font-weight:600" ${this._pwaInstallAvailable ? '' : 'disabled'}>
                ${this._pwaInstalling ? 'Instalando...' : this._pwaInstalled ? 'App Instalada' : 'Instalar App'}
              </button>
              <button id="oi-force-update" style="flex:1;min-width:140px;background:#1a56db;color:#fff;border:none;padding:10px 12px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600">
                Actualizar ahora
              </button>
            </div>
          </div>` : ''}
      </div>`;

    this.container.querySelector('#oi-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showMenu = !this._showMenu;
      this._render();
    });

    this.container.querySelector('#oi-install-app')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.__MAXGRIFOS_PWA__?.promptInstall?.();
    });

    this.container.querySelector('#oi-force-update')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      this._showMenu = false;
      this._render();
      await forceUpdate();
    });
  }
}

