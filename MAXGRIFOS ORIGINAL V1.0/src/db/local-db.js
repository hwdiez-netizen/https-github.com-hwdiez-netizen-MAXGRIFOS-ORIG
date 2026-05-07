import { openDB } from 'idb';

const DB_NAME = 'maxgrifos-erp';
const DB_VERSION = 21;
const ALL_STORES = [
  'products', 'sync_queue', 'audit_sessions', 'audit_items', 'clientes',
  'kardex_movimientos', 'bodegas', 'pedidos', 'pedido_items', 'pedido_saga_log',
  'documentos', 'numeracion_consecutiva', 'config_comprobantes',
  'listas_precios', 'precio_items', 'dinamica_comercial', 'dinamica_auditoria',
  'proveedores', 'compras', 'compra_items', 'config_compras',
  'event_store', 'listas_trazabilidad', 'rbac_audit_log',
  'garantias', 'item_ledger',
];
const RESET_CONFIRMATION_PHRASE = 'BORRAR TODOS MIS DATOS';
const SYNC_QUEUE_PROCESSING_STALE_MS = 5 * 60 * 1000;
const BACKUP_STORAGE_KEY = `${DB_NAME}:pre_upgrade_backup`;
const BACKUP_MAX_ROWS_PER_STORE = 2000;
const DB_SAFETY_STATUS_KEY = `${DB_NAME}:db_safety_status`;
const CRITICAL_STORES = [
  'products',
  'clientes',
  'pedidos',
  'pedido_items',
  'documentos',
  'sync_queue',
  'kardex_movimientos',
  'event_store',
  'garantias',
];

let db;

async function _safeReadStoreRows(tempDb, storeName, maxRows = BACKUP_MAX_ROWS_PER_STORE) {
  if (!tempDb.objectStoreNames.contains(storeName)) return [];
  const rows = await tempDb.getAll(storeName);
  return rows.slice(0, maxRows);
}

function _persistBackupSnapshot(snapshot) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage) return false;
  try {
    window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn('[DB] no fue posible persistir backup pre-upgrade en localStorage', error?.message ?? String(error));
    return false;
  }
}

function _persistDbSafetyStatus(status) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage) return false;
  try {
    window.localStorage.setItem(DB_SAFETY_STATUS_KEY, JSON.stringify(status));
    return true;
  } catch (error) {
    console.warn('[DB] no fue posible persistir estado de seguridad DB', error?.message ?? String(error));
    return false;
  }
}

function _safeReadJSONFromLocalStorage(key) {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function _verifyPostUpgradeState(activeDb, backupSnapshot) {
  if (!activeDb) throw new Error('DB_NO_DISPONIBLE_POST_UPGRADE');
  const missingStores = CRITICAL_STORES.filter((store) => !activeDb.objectStoreNames.contains(store));
  if (missingStores.length > 0) {
    throw new Error(`POST_UPGRADE_MISSING_STORES:${missingStores.join(',')}`);
  }

  const postCounts = {};
  for (const storeName of CRITICAL_STORES) {
    try {
      postCounts[storeName] = await activeDb.count(storeName);
    } catch (error) {
      throw new Error(`POST_UPGRADE_COUNT_FAIL:${storeName}:${error?.message ?? String(error)}`);
    }
  }

  const backupCounts = backupSnapshot?.counts ?? {};
  const suspiciousDrops = [];
  for (const storeName of CRITICAL_STORES) {
    const before = Number(backupCounts?.[storeName] ?? 0);
    const after = Number(postCounts?.[storeName] ?? 0);
    if (before > 0 && after === 0) {
      suspiciousDrops.push({ store: storeName, before, after });
    }
  }
  if (suspiciousDrops.length > 0) {
    throw new Error(`POST_UPGRADE_DATA_DROP:${suspiciousDrops.map((d) => d.store).join(',')}`);
  }

  const status = {
    checked_at: new Date().toISOString(),
    db_name: DB_NAME,
    db_version: activeDb.version,
    critical_stores: CRITICAL_STORES,
    backup_counts: backupCounts,
    post_counts: postCounts,
    suspicious_drops: suspiciousDrops,
    status: 'ok',
  };
  _persistDbSafetyStatus(status);
  window.dispatchEvent(new CustomEvent('db-post-upgrade-verified', { detail: status }));
  return status;
}

async function _createPreUpgradeBackupSnapshot(reason = 'pre_upgrade') {
  let tempDb;
  try {
    tempDb = await openDB(DB_NAME);
    if (tempDb.objectStoreNames.length === 0) return;

    const stores = [
      'products',
      'clientes',
      'listas_precios',
      'precio_items',
      'pedidos',
      'pedido_items',
      'documentos',
      'sync_queue',
      'kardex_movimientos',
      'event_store',
      'compras',
      'audit_sessions',
      'audit_items',
    ];
    const data = {};
    const counts = {};
    for (const store of stores) {
      const rows = await _safeReadStoreRows(tempDb, store);
      data[store] = rows;
      counts[store] = rows.length;
    }

    const snapshot = {
      db_name: DB_NAME,
      db_version_detected: tempDb.version,
      target_db_version: DB_VERSION,
      reason,
      created_at: new Date().toISOString(),
      max_rows_per_store: BACKUP_MAX_ROWS_PER_STORE,
      counts,
      data,
    };

    const persisted = _persistBackupSnapshot(snapshot);
    window.dispatchEvent(new CustomEvent('db-pre-upgrade-backup-created', {
      detail: { persisted, created_at: snapshot.created_at, counts: snapshot.counts, reason },
    }));
    return {
      persisted,
      created_at: snapshot.created_at,
      counts: snapshot.counts,
      reason,
      db_version_detected: snapshot.db_version_detected,
    };
  } catch (error) {
    console.warn('[DB] no fue posible crear backup pre-upgrade', error?.message ?? String(error));
    return null;
  } finally {
    tempDb?.close();
  }
}

export async function initDB() {
  const preUpgradeBackup = await _createPreUpgradeBackupSnapshot('initdb_before_upgrade');
  await _preflightV9();
  await _preflightV13();

  try {
    db = await _openDBWithUpgrade();
    await _verifyPostUpgradeState(db, preUpgradeBackup);
  } catch (err) {
    await _createPreUpgradeBackupSnapshot('upgrade_failed_safe_mode');
    console.error('[DB] upgrade fallido - abriendo en version almacenada:', err?.message ?? err);
    const errorMessage = err?.message ?? String(err);
    if (String(errorMessage).startsWith('POST_UPGRADE_')) {
      window.dispatchEvent(new CustomEvent('db-post-upgrade-verification-failed', {
        detail: {
          error: errorMessage,
          storedVersion: db?.version ?? 'desconocida',
          backup_created_at: preUpgradeBackup?.created_at ?? null,
          backup_counts: preUpgradeBackup?.counts ?? {},
        },
      }));
    }
    try {
      db = await openDB(DB_NAME);
      const backupForFallback = preUpgradeBackup ?? _safeReadJSONFromLocalStorage(BACKUP_STORAGE_KEY);
      await _verifyPostUpgradeState(db, backupForFallback);
    } catch (fallbackErr) {
      console.error('[DB] fallback tambien fallo:', fallbackErr?.message ?? fallbackErr);
      db = null;
      _persistDbSafetyStatus({
        checked_at: new Date().toISOString(),
        db_name: DB_NAME,
        status: 'failed',
        error: fallbackErr?.message ?? String(fallbackErr),
      });
    }
    window.dispatchEvent(new CustomEvent('db-upgrade-failed', {
      detail: { error: errorMessage, storedVersion: db?.version ?? 'desconocida', fallback_ok: Boolean(db) }
    }));
  }

  return db;
}

async function _openDBWithUpgrade() {
  const opened = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      // DB en v1 sin stores: estado corrompido por el bug de _preflightV9().
      // Tratar como instalaciÃ³n limpia (oldVersion=0) para que el bloque <1
      // cree todos los stores desde cero en lugar de fallar en ramas intermedias.
      const eff = (oldVersion === 1 && database.objectStoreNames.length === 0) ? 0 : oldVersion;
      if (eff < 1) {
        const store = database.createObjectStore('products', { keyPath: 'id' });
        store.createIndex('sync_status', 'sync_status');
        store.createIndex('status', 'status');
        store.createIndex('created_at', 'created_at');
        store.createIndex('sku', 'sku', { unique: false });

        const sq = database.createObjectStore('sync_queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        sq.createIndex('entity_id', 'entity_id');
      } else if (eff < 2) {
        if (database.objectStoreNames.contains('products')) {
          const store = transaction.objectStore('products');
          if (!store.indexNames.contains('sku')) {
            store.createIndex('sku', 'sku', { unique: false });
          }
        }
      }
      if (eff < 3) {
        const sessions = database.createObjectStore('audit_sessions', { keyPath: 'id' });
        sessions.createIndex('status', 'status');

        const items = database.createObjectStore('audit_items', { keyPath: 'id' });
        items.createIndex('session_id', 'session_id');
      }
      if (eff < 4) {
        const clientes = database.createObjectStore('clientes', { keyPath: 'id' });
        clientes.createIndex('cedula', 'cedula', { unique: false });
        clientes.createIndex('status', 'status');
        clientes.createIndex('sync_status', 'sync_status');
        clientes.createIndex('created_at', 'created_at');
      }
      if (eff < 5) {
        const kardex = database.createObjectStore('kardex_movimientos', { keyPath: 'id' });
        kardex.createIndex('product_id', 'product_id');
        kardex.createIndex('tipo', 'tipo');
        kardex.createIndex('created_at', 'created_at');
        kardex.createIndex('sync_status', 'sync_status');
      }
      if (eff < 6) {
        const bodegas = database.createObjectStore('bodegas', { keyPath: 'id' });
        bodegas.createIndex('tipo', 'tipo');
        bodegas.createIndex('status', 'status');

        const pedidos = database.createObjectStore('pedidos', { keyPath: 'id' });
        pedidos.createIndex('estado', 'estado');
        pedidos.createIndex('cliente_id', 'cliente_id');
        pedidos.createIndex('created_at', 'created_at');
        pedidos.createIndex('sync_status', 'sync_status');

        const pitems = database.createObjectStore('pedido_items', { keyPath: 'id' });
        pitems.createIndex('pedido_id', 'pedido_id');
        pitems.createIndex('product_id', 'product_id');

        const pslog = database.createObjectStore('pedido_saga_log', { keyPath: 'id' });
        pslog.createIndex('pedido_id', 'pedido_id');

        const docs = database.createObjectStore('documentos', { keyPath: 'id' });
        docs.createIndex('tipo', 'tipo');
        docs.createIndex('consecutivo', 'consecutivo', { unique: true });
        docs.createIndex('pedido_id', 'pedido_id');
        docs.createIndex('estado', 'estado');

        database.createObjectStore('numeracion_consecutiva', { keyPath: 'clave' });
      }
      if (eff < 7) {
        database.createObjectStore('config_comprobantes', { keyPath: 'id' });
      }
      if (eff < 8) {
        const lp = database.createObjectStore('listas_precios', { keyPath: 'id' });
        lp.createIndex('tipo_cliente', 'tipo_cliente');
        lp.createIndex('estado_proceso', 'estado_proceso');
        lp.createIndex('activa', 'activa');
        lp.createIndex('sync_status', 'sync_status');
        lp.createIndex('created_at', 'created_at');

        const pi = database.createObjectStore('precio_items', { keyPath: 'id' });
        pi.createIndex('lista_id', 'lista_id');
        pi.createIndex('product_id', 'product_id');
        pi.createIndex('status', 'status');

        const dc = database.createObjectStore('dinamica_comercial', { keyPath: 'id' });
        dc.createIndex('activa', 'activa');
        dc.createIndex('estado_proceso', 'estado_proceso');
        dc.createIndex('sync_status', 'sync_status');
        dc.createIndex('created_at', 'created_at');

        const da = database.createObjectStore('dinamica_auditoria', { keyPath: 'id' });
        da.createIndex('dinamica_id', 'dinamica_id');
        da.createIndex('tipo', 'tipo');
        da.createIndex('created_at', 'created_at');
      }
      if (eff < 9) {
        // Datos ya saneados por _preflightV9(). Solo reestructura Ã­ndices (sync).
        const pStore = transaction.objectStore('products');
        pStore.deleteIndex('sku');
        pStore.createIndex('sku', 'sku', { unique: true });

        const cStore = transaction.objectStore('clientes');
        cStore.deleteIndex('cedula');
        cStore.createIndex('cedula',  'cedula',   { unique: true });
        cStore.createIndex('nit',     'nit',      { unique: true });
        cStore.createIndex('qr_code', 'qr_code',  { unique: true });
      }
      if (eff < 10) {
        // Outbox transaccional: Ã­ndice de estado para filtrar pending/failed sin full scan.
        const sq = transaction.objectStore('sync_queue');
        sq.createIndex('status', 'status');
      }
      if (eff < 11) {
        const prov = database.createObjectStore('proveedores', { keyPath: 'id' });
        prov.createIndex('nit', 'nit', { unique: true });
        prov.createIndex('status', 'status');
        prov.createIndex('sync_status', 'sync_status');
      }
      if (eff < 12) {
        const compras = database.createObjectStore('compras', { keyPath: 'id' });
        compras.createIndex('numero', 'numero', { unique: false });
        compras.createIndex('estado', 'estado');
        compras.createIndex('proveedor_id', 'proveedor_id');
        compras.createIndex('created_at', 'created_at');
        compras.createIndex('sync_status', 'sync_status');

        const citems = database.createObjectStore('compra_items', { keyPath: 'id' });
        citems.createIndex('compra_id', 'compra_id');

        database.createObjectStore('config_compras', { keyPath: 'id' });
      }
      if (eff < 13) {
        // EXCEPCIÃ“N Â§1.1 â€” Riesgo de integridad estructural confirmado:
        // Race condition en kardex_movimientos: dos tabs concurrentes pasan el
        // guard JS y producen movimientos duplicados. SoluciÃ³n: Ã­ndice Ãºnico
        // en idempotency_key forzado por motor IDB (rechaza con ConstraintError).
        // Datos pre-migrados por _preflightV13() antes de este upgrade.
        const kStore = transaction.objectStore('kardex_movimientos');
        if (!kStore.indexNames.contains('idempotency_key')) {
          kStore.createIndex('idempotency_key', 'idempotency_key', { unique: true });
        }

        // Event store persistente â€” ConstituciÃ³n Â§4 Trazabilidad total.
        // Cada evento del bus se persiste aquÃ­ antes de dispatch.
        const es = database.createObjectStore('event_store', { keyPath: 'event_id' });
        es.createIndex('type', 'type');
        es.createIndex('timestamp', 'timestamp');
        es.createIndex('aggregate_id', 'aggregate_id');
        es.createIndex('replayed', 'replayed');
      }
      if (eff < 14) {
        // AUDIT-FAILED-20260425T0117Z Fix 4:
        // Ãndice Ãºnico en sync_queue.idempotency_key para forzar idempotencia
        // a nivel de motor IDB. Evita entradas duplicadas en el outbox.
        const sq = transaction.objectStore('sync_queue');
        if (!sq.indexNames.contains('idempotency_key')) {
          sq.createIndex('idempotency_key', 'idempotency_key', { unique: true });
        }
      }
      if (eff < 15) {
        // Trazabilidad de cambios en listas de precios + Ã­ndice forma_pago canÃ³nico.
        const lt = database.createObjectStore('listas_trazabilidad', { keyPath: 'id' });
        lt.createIndex('lista_id', 'lista_id');
        lt.createIndex('fecha', 'fecha');
        const lp = transaction.objectStore('listas_precios');
        if (!lp.indexNames.contains('forma_pago')) {
          lp.createIndex('forma_pago', 'forma_pago');
        }
      }
      if (eff < 16) {
        // AuditorÃ­a RBAC â€” append-only. Registro de toda acciÃ³n ejecutada por handlers.
        // P14_AUDIT_LEDGER: user, role, action, result (ALLOW/DENY), timestamp.
        const ral = database.createObjectStore('rbac_audit_log', { keyPath: 'id' });
        ral.createIndex('action',    'action');
        ral.createIndex('result',    'result');
        ral.createIndex('timestamp', 'timestamp');
        ral.createIndex('user',      'user');
        ral.createIndex('role',      'role');
      }
      if (eff < 17) {
        // Módulo Garantías — creación original para usuarios en v16.
        // Guard: si ya existe (p.ej. creado en eff<18 en la misma transacción) no duplicar.
        if (!database.objectStoreNames.contains('garantias')) {
          const gar = database.createObjectStore('garantias', { keyPath: 'id' });
          gar.createIndex('estado',       'estado');
          gar.createIndex('cliente_id',   'cliente_id');
          gar.createIndex('product_id',   'product_id');
          gar.createIndex('proveedor_id', 'proveedor_id');
          gar.createIndex('created_at',   'created_at');
          gar.createIndex('kardex_transfer_id', 'kardex_transfer_id');
        }
      }
      if (eff < 18) {
        // Migración correctiva: usuarios que tenían v17 sin el store garantías.
        if (!database.objectStoreNames.contains('garantias')) {
          const gar = database.createObjectStore('garantias', { keyPath: 'id' });
          gar.createIndex('estado',       'estado');
          gar.createIndex('cliente_id',   'cliente_id');
          gar.createIndex('product_id',   'product_id');
          gar.createIndex('proveedor_id', 'proveedor_id');
          gar.createIndex('created_at',   'created_at');
          gar.createIndex('kardex_transfer_id', 'kardex_transfer_id');
        }
      }
      if (eff < 19) {
        // Rescate: usuarios que llegaron a v18 sin el store garantías por version-skew
        // (DB ya estaba en v18 cuando se introdujo el módulo; onupgradeneeded no disparó).
        if (!database.objectStoreNames.contains('garantias')) {
          const gar = database.createObjectStore('garantias', { keyPath: 'id' });
          gar.createIndex('estado',       'estado');
          gar.createIndex('cliente_id',   'cliente_id');
          gar.createIndex('product_id',   'product_id');
          gar.createIndex('proveedor_id', 'proveedor_id');
          gar.createIndex('created_at',   'created_at');
          gar.createIndex('kardex_transfer_id', 'kardex_transfer_id');
        }
      }
      if (eff < 20) {
        // Rescate v20: DBs en v19 incompletas sin store garantias.
        if (!database.objectStoreNames.contains('garantias')) {
          const gar = database.createObjectStore('garantias', { keyPath: 'id' });
          gar.createIndex('estado',       'estado');
          gar.createIndex('cliente_id',   'cliente_id');
          gar.createIndex('product_id',   'product_id');
          gar.createIndex('proveedor_id', 'proveedor_id');
          gar.createIndex('created_at',   'created_at');
          gar.createIndex('kardex_transfer_id', 'kardex_transfer_id');
        }
      }
      if (eff < 21) {
        // Multiusuario v21: ledger de cambios por ítem con trazabilidad completa.
        // Permite auditar quién contó qué, cuándo y desde qué dispositivo.
        if (!database.objectStoreNames.contains('item_ledger')) {
          const il = database.createObjectStore('item_ledger', { keyPath: 'id' });
          il.createIndex('item_id',    'item_id');
          il.createIndex('session_id', 'session_id');
          il.createIndex('timestamp',  'timestamp');
          il.createIndex('device_id',  'device_id');
        }
      }
    },
    blocked(currentVersion, blockedVersion) {
      // Otra pestaÃ±a tiene la DB abierta en versiÃ³n anterior; el upgrade espera.
      console.warn(`[DB] upgrade bloqueado (v${currentVersion}â†’v${blockedVersion}). Cierra otras pestaÃ±as.`);
      window.dispatchEvent(new CustomEvent('db-upgrade-blocked', { detail: { currentVersion, blockedVersion } }));
    },
    blocking(currentVersion, blockedVersion) {
      // Esta conexiÃ³n estÃ¡ impidiendo un upgrade en otra pestaÃ±a; cerrar para desbloquearlo.
      console.warn(`[DB] cerrando conexiÃ³n para permitir upgrade v${currentVersion}â†’v${blockedVersion}.`);
      db?.close();
      db = null;
    },
    terminated() {
      console.error('[DB] conexiÃ³n terminada inesperadamente por el navegador.');
      db = null;
    },
  });

  opened.addEventListener('versionchange', () => {
    opened.close();
    db = null;
  });

  return opened;
}

// OVERLAY v13 â€” Preflight: deduplica kardex_movimientos por idempotency_key
// antes de que el upgrade v13 cree el Ã­ndice Ãºnico. Idempotente: si ya es v13, no-op.
// EXCEPCIÃ“N Â§1.1: riesgo de integridad estructural (race condition confirmada).
async function _preflightV13() {
  let tempDb;
  try {
    tempDb = await openDB(DB_NAME);
    if (tempDb.version >= 13) return;
    if (!tempDb.objectStoreNames.contains('kardex_movimientos')) return;

    const tx = tempDb.transaction('kardex_movimientos', 'readwrite');
    const all = await tx.store.getAll();
    const seen = new Map();
    for (const m of all) {
      if (!m.idempotency_key) continue;
      if (seen.has(m.idempotency_key)) {
        // Mantiene el mÃ¡s reciente; renombra el duplicado para liberar la clave
        const prev = seen.get(m.idempotency_key);
        if (m.created_at > prev.created_at) {
          await tx.store.put({ ...prev, idempotency_key: `${prev.idempotency_key}_DUP_${prev.id.slice(0, 8)}` });
          seen.set(m.idempotency_key, m);
        } else {
          await tx.store.put({ ...m, idempotency_key: `${m.idempotency_key}_DUP_${m.id.slice(0, 8)}` });
        }
      } else {
        seen.set(m.idempotency_key, m);
      }
    }
    await tx.done;
  } catch {
    // DB no existe o no tiene kardex â†’ no-op
  } finally {
    tempDb?.close();
  }
}

// Abre la DB en su versiÃ³n actual (sin upgrade), sanitiza los datos legacy
// que impedirÃ­an crear Ã­ndices unique en v9. Idempotente: si ya es v9, no-op.
async function _preflightV9() {
  let tempDb;
  try {
    tempDb = await openDB(DB_NAME);
    // Fresh install: DB creada en v1 sin stores â†’ no hay datos que sanear.
    // Salir ya para que openDB(..., DB_VERSION) reciba oldVersion=0 y corra
    // el bloque <1 que crea todos los stores desde cero.
    if (tempDb.objectStoreNames.length === 0) return;
    if (tempDb.version >= 9) return; // ya migrado

    const stores = Array.from(tempDb.objectStoreNames);
    const hasProducts = stores.includes('products');
    const hasClientes = stores.includes('clientes');

    if (hasProducts) {
      const tx = tempDb.transaction('products', 'readwrite');
      const all = await tx.store.getAll();
      const skuSeen = new Map();
      for (const p of all) {
        if (!p.sku) continue;
        if (skuSeen.has(p.sku)) {
          const n = skuSeen.get(p.sku) + 1;
          skuSeen.set(p.sku, n);
          p.sku = `${p.sku}_DUP${n}`;
          await tx.store.put(p);
        } else {
          skuSeen.set(p.sku, 1);
        }
      }
      await tx.done;
    }

    if (hasClientes) {
      const tx = tempDb.transaction('clientes', 'readwrite');
      const all = await tx.store.getAll();
      const cedulaSeen = new Map();
      const nitSeen    = new Map();
      const qrSeen     = new Map();
      for (const c of all) {
        let changed = false;
        // '' / null â†’ delete: IDB no indexa propiedades ausentes (sparse).
        // null tampoco es aceptable en Ã­ndices unique compartidos.
        if (c.cedula == null || c.cedula === '') { delete c.cedula; changed = true; }
        if (c.nit    == null || c.nit    === '') { delete c.nit;    changed = true; }
        if (c.qr_code == null || c.qr_code === '') { delete c.qr_code; changed = true; }
        if (c.cedula !== undefined) {
          if (cedulaSeen.has(c.cedula)) {
            const n = cedulaSeen.get(c.cedula) + 1;
            cedulaSeen.set(c.cedula, n);
            c.cedula = `${c.cedula}_DUP${n}`;
            changed = true;
          } else { cedulaSeen.set(c.cedula, 1); }
        }
        if (c.nit !== undefined) {
          if (nitSeen.has(c.nit)) {
            const n = nitSeen.get(c.nit) + 1;
            nitSeen.set(c.nit, n);
            c.nit = `${c.nit}_DUP${n}`;
            changed = true;
          } else { nitSeen.set(c.nit, 1); }
        }
        if (c.qr_code) {
          if (qrSeen.has(c.qr_code)) {
            const n = qrSeen.get(c.qr_code) + 1;
            qrSeen.set(c.qr_code, n);
            c.qr_code = `${c.qr_code}_DUP${n}`;
            changed = true;
          } else { qrSeen.set(c.qr_code, 1); }
        }
        if (changed) await tx.store.put(c);
      }
      await tx.done;
    }
  } catch {
    // DB no existe todavÃ­a (primera instalaciÃ³n) â†’ no-op
  } finally {
    tempDb?.close();
  }
}

export async function saveProduct(product) {
  return db.put('products', product);
}

// Atomic: saves the product entity AND enqueues the sync operation in a single IDB transaction.
// Prevents the P9 failure mode where saveProduct succeeds but addToSyncQueue is never reached.
export async function saveProductWithSyncQueue(product, operation) {
  const tx = db.transaction(['products', 'sync_queue'], 'readwrite');
  await tx.objectStore('products').put(product);
  await tx.objectStore('sync_queue').add({
    idempotency_key: crypto.randomUUID(),
    retry_count: 0,
    max_retries: 3,
    status: 'pending',
    ...operation,
  });
  await tx.done;
}

// AUDIT-FAILED-20260425T0117Z Fix 3 â€” Outbox atÃ³mico universal.
// Guarda la entidad Y su entrada de sync_queue en UNA sola transacciÃ³n IDB.
// Si el proceso muere en cualquier punto, ambas escrituras se revierten juntas.
// EXCEPCIÃ“N Â§1.1: requerido por riesgo de integridad estructural confirmado.
// storeName: nombre del object store IDB ('clientes', 'pedidos', 'documentos')
// entity: el objeto completo a persistir (debe tener campo 'id')
// outboxMeta: { type, entity, entity_id, payload, idempotency_key? }
// F1R1-BLOCKER-003 FIX: pre-valida idempotency_key con index().get() DENTRO de la
// transacciÃ³n antes de add(). No depende de ConstraintError para control de flujo.
// Una transacciÃ³n IDB readwrite serializa todas sus operaciones; el index().get()
// es consistente con el estado del transaction scope â†’ no hay TOCTOU intra-tx.
export async function saveWithOutbox(storeName, entity, outboxMeta) {
  const idemKey = outboxMeta.idempotency_key
    ?? `OUTBOX:${storeName}:${entity.id}:${outboxMeta.type}`;
  const tx = db.transaction([storeName, 'sync_queue'], 'readwrite');

  // 1. Persistir entidad (put = upsert, nunca falla por PK)
  await tx.objectStore(storeName).put(entity);

  // 2. Pre-validar idempotency_key dentro del mismo transaction scope
  const sqStore = tx.objectStore('sync_queue');
  const existing = await sqStore.index('idempotency_key').get(idemKey);
  if (!existing) {
    // Solo encolar si no existe: cero riesgo de ConstraintError
    await sqStore.add({
      retry_count: 0,
      max_retries: 3,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...outboxMeta,
      idempotency_key: idemKey,
    });
  }

  // 3. Commit atÃ³mico: entity + outbox_entry (o solo entity si ya encolado)
  await tx.done;
  return entity;
}

export async function getProduct(id) {
  return db.get('products', id);
}

export async function getAllProducts() {
  const all = await db.getAll('products');
  return all.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export async function getProductsBySku(sku) {
  return db.getAllFromIndex('products', 'sku', sku);
}

export async function updateProductSyncStatus(id, syncStatus) {
  const product = await db.get('products', id);
  if (!product) return;
  product.sync_status = syncStatus;
  product.updated_at = new Date().toISOString();
  return db.put('products', product);
}

export async function deleteProductRecord(id) {
  return db.delete('products', id);
}

export async function addToSyncQueue(operation) {
  // F4-PRODUCT_SYNC: idempotencia obligatoria.
  // operation.idempotency_key debe venir definida (ej: "SYNC:CREATE:product-id").
  // Si no viene, generar fallback para backward compatibility.
  const idemKey = operation.idempotency_key
    ?? `SYNC:${operation.type ?? 'UNKNOWN'}:${operation.entity_id ?? 'UNKNOWN'}`;

  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');

  // Pre-validar: si ya existe con esta clave, return early (idempotente).
  // No duplicar registros por retries.
  const existing = await store.index('idempotency_key').get(idemKey);
  if (!existing) {
    await store.add({
      retry_count: 0,
      max_retries: 3,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...operation,
      idempotency_key: idemKey,
    });
  }

  await tx.done;
  return existing ? false : true; // true = creado, false = ya existÃ­a (idempotente)
}


export async function getSyncQueue() {
  return db.getAll('sync_queue');
}

function _isPendingSyncQueueItem(item) {
  return !item.status || item.status === 'pending';
}

function _isStaleProcessingSyncQueueItem(item, staleMs = SYNC_QUEUE_PROCESSING_STALE_MS) {
  if (item.status !== 'processing') return false;
  const startedAtMs = Date.parse(item.processing_started_at ?? '');
  if (!Number.isFinite(startedAtMs)) return true;
  return (Date.now() - startedAtMs) > staleMs;
}

export async function claimSyncQueueItem(id, owner = 'sync_worker', options = {}) {
  const staleMs = options?.staleMs ?? SYNC_QUEUE_PROCESSING_STALE_MS;
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  const item = await store.get(id);
  if (!item) {
    await tx.done;
    return null;
  }

  const canClaim = _isPendingSyncQueueItem(item) || _isStaleProcessingSyncQueueItem(item, staleMs);
  if (!canClaim) {
    await tx.done;
    return null;
  }

  const now = new Date().toISOString();
  const claimed = {
    ...item,
    status: 'processing',
    processing_owner: owner,
    processing_started_at: now,
    updated_at: now,
  };
  await store.put(claimed);
  await tx.done;
  return claimed;
}

export async function updateSyncQueueItem(id, patch) {
  const item = await db.get('sync_queue', id);
  if (!item) return;
  return db.put('sync_queue', { ...item, ...patch });
}

export async function removeSyncQueueItem(id) {
  return db.delete('sync_queue', id);
}

const _DOMAIN_LABELS = {
  product:            'Productos',
  cliente:            'Clientes',
  kardex:             'Kardex',
  pedido:             'Pedidos',
  documento:          'Documentos',
  lista_precios:      'Listas de precios',
  dinamica_comercial: 'Din. comercial',
};

export async function getOutboxStats() {
  const all = await db.getAll('sync_queue');
  const domainMap = {};
  for (const i of all) {
    const key = i.entity || 'product';
    if (!domainMap[key]) domainMap[key] = { pending: 0, failed: 0 };
    if (!i.status || i.status === 'pending' || i.status === 'processing') domainMap[key].pending++;
    else if (i.status === 'failed')          domainMap[key].failed++;
  }
  const byDomain = Object.entries(domainMap)
    .filter(([, d]) => d.pending > 0 || d.failed > 0)
    .map(([entity, d]) => ({ entity, label: _DOMAIN_LABELS[entity] ?? entity, ...d }));
  return {
    pending:  all.filter((i) => !i.status || i.status === 'pending' || i.status === 'processing').length,
    failed:   all.filter((i) => i.status === 'failed').length,
    total:    all.length,
    byDomain,
  };
}

export async function saveAuditSession(session) {
  return db.put('audit_sessions', session);
}

export async function getAuditSession(id) {
  return db.get('audit_sessions', id);
}

export async function getAllAuditSessions() {
  const all = await db.getAll('audit_sessions');
  return all.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
}

export async function saveAuditItem(item) {
  return db.put('audit_items', item);
}

export async function getAuditItemById(id) {
  return db.get('audit_items', id);
}

export async function getAuditItemsBySession(sessionId) {
  return db.getAllFromIndex('audit_items', 'session_id', sessionId);
}

export async function saveItemLedgerEntry(entry) {
  return db.put('item_ledger', entry);
}

export async function getItemLedgerByItem(itemId) {
  const all = await db.getAllFromIndex('item_ledger', 'item_id', itemId);
  return all.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
}

export async function getInProgressAuditSessions() {
  return db.getAllFromIndex('audit_sessions', 'status', 'in_progress');
}

// F8: Todas las sesiones cerradas/completadas/abandonadas (solo lectura)
export async function getClosedAuditSessions() {
  const all = await db.getAll('audit_sessions');
  const openStatuses = new Set(['in_progress', 'active', 'closing']);
  return all
    .filter((s) => !openStatuses.has(s.status))
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
}

export async function saveCliente(cliente) {
  return db.put('clientes', cliente);
}

export async function getCliente(id) {
  return db.get('clientes', id);
}

export async function getAllClientes() {
  const all = await db.getAll('clientes');
  return all.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export async function getClientesByCedula(cedula) {
  return db.getAllFromIndex('clientes', 'cedula', cedula);
}

export async function getClientesByNit(nit) {
  return db.getAllFromIndex('clientes', 'nit', nit);
}

export async function getClientesByQr(qr) {
  return db.getAllFromIndex('clientes', 'qr_code', qr);
}

export async function updateClienteSyncStatus(id, syncStatus) {
  const cliente = await db.get('clientes', id);
  if (!cliente) return;
  cliente.sync_status = syncStatus;
  cliente.updated_at = new Date().toISOString();
  return db.put('clientes', cliente);
}

// OVERLAY v13: trata ConstraintError en idempotency_key como Ã©xito silencioso.
// Un ConstraintError en put() SOLO ocurre por violaciÃ³n de Ã­ndice Ãºnico secundario
// (el primary key usa upsert). Por tanto, solo aplica cuando idempotency_key
// ya existe con distinto id â†’ movimiento duplicado â†’ descartar silenciosamente.
export async function saveMovimiento(movimiento) {
  try {
    return await db.put('kardex_movimientos', movimiento);
  } catch (err) {
    if (err?.name === 'ConstraintError') return null;
    throw err;
  }
}

export async function getMovimiento(id) {
  return db.get('kardex_movimientos', id);
}

export async function getAllMovimientos() {
  const all = await db.getAll('kardex_movimientos');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getMovimientosByProduct(productId) {
  const all = await db.getAllFromIndex('kardex_movimientos', 'product_id', productId);
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getMovimientoByIdempotencyKey(key) {
  return db.getFromIndex('kardex_movimientos', 'idempotency_key', key);
}

export async function updateMovimientoSyncStatus(id, syncStatus) {
  const mov = await db.get('kardex_movimientos', id);
  if (!mov) return;
  mov.sync_status = syncStatus;
  mov.updated_at = new Date().toISOString();
  return db.put('kardex_movimientos', mov);
}

// â”€â”€ Bodegas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveBodega(bodega) { return db.put('bodegas', bodega); }
export async function getBodega(id) { return db.get('bodegas', id); }
export async function getAllBodegas() { return db.getAll('bodegas'); }

// â”€â”€ Pedidos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function savePedido(pedido) { return db.put('pedidos', pedido); }
export async function getPedido(id) { return db.get('pedidos', id); }
export async function getAllPedidos() {
  const all = await db.getAll('pedidos');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function getPedidosByEstado(estado) {
  return db.getAllFromIndex('pedidos', 'estado', estado);
}
export async function updatePedidoSyncStatus(id, syncStatus) {
  const p = await db.get('pedidos', id);
  if (!p) return;
  p.sync_status = syncStatus;
  p.updated_at = new Date().toISOString();
  return db.put('pedidos', p);
}

// â”€â”€ Pedido Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function savePedidoItem(item) { return db.put('pedido_items', item); }
export async function getPedidoItems(pedidoId) {
  return db.getAllFromIndex('pedido_items', 'pedido_id', pedidoId);
}
export async function deletePedidoItem(id) { return db.delete('pedido_items', id); }

// â”€â”€ Saga Log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveSagaLog(entry) { return db.put('pedido_saga_log', entry); }
export async function getSagaLog(pedidoId) {
  const all = await db.getAllFromIndex('pedido_saga_log', 'pedido_id', pedidoId);
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
// FASE 1.5 R8: dashboard trazabilidad consolidada
export async function getAllSagaLogs(limit = 500) {
  const all = await db.getAll('pedido_saga_log');
  return all.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, limit);
}

// â”€â”€ Documentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveDocumento(doc) { return db.put('documentos', doc); }
export async function getDocumento(id) { return db.get('documentos', id); }
export async function getDocumentoByPedido(pedidoId) {
  const all = await db.getAllFromIndex('documentos', 'pedido_id', pedidoId);
  return all[0] ?? null;
}
export async function getAllDocumentos() {
  const all = await db.getAll('documentos');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// â”€â”€ NumeraciÃ³n Consecutiva (transacciÃ³n atÃ³mica) â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getNextConsecutivo(tipo) {
  const anio  = new Date().getFullYear();
  const clave = `${tipo}-${anio}`;
  
  // Leer la configuraciÃ³n primero (por si hay un nÃºmero inicial distinto de 1)
  const config = await db.get('config_comprobantes', tipo) || { prefijo: tipo, numero_inicial: 1 };
  const prefijo = String(config.prefijo ?? tipo).trim().toUpperCase() || tipo;

  const tx    = db.transaction('numeracion_consecutiva', 'readwrite');
  const store = tx.objectStore('numeracion_consecutiva');
  const rec   = (await store.get(clave)) ?? { clave, tipo, anio, ultimo: (config.numero_inicial - 1) };
  
  rec.ultimo += 1;
  await store.put(rec);
  await tx.done;
  const nn = String(rec.ultimo).padStart(4, '0');
  return `${prefijo}-${anio}-${nn}`;
}

export async function saveConfigComprobante(config) {
  return db.put('config_comprobantes', config);
}

export async function getConfigComprobante(tipo) {
  return db.get('config_comprobantes', tipo);
}

// â”€â”€ Listas de Precios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveLista(lista) { return db.put('listas_precios', lista); }
export async function getLista(id) { return db.get('listas_precios', id); }
export async function getAllListas() {
  const all = await db.getAll('listas_precios');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export async function getListasByTipoCliente(tipoCliente) {
  return db.getAllFromIndex('listas_precios', 'tipo_cliente', tipoCliente);
}
export async function getListasByFormaPago(formaPago) {
  return db.getAllFromIndex('listas_precios', 'forma_pago', formaPago);
}

// â”€â”€ Listas Trazabilidad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveTrazabilidad(registro) { return db.put('listas_trazabilidad', registro); }
export async function getTrazabilidadByLista(listaId) {
  return db.getAllFromIndex('listas_trazabilidad', 'lista_id', listaId);
}
export async function getAllTrazabilidad() {
  return db.getAll('listas_trazabilidad');
}

// â”€â”€ Limpieza de datos de prueba â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function clearTestData() {
  await db.clear('listas_precios');
  await db.clear('precio_items');
  const storeNames = Array.from(db.objectStoreNames);
  if (storeNames.includes('listas_trazabilidad')) await db.clear('listas_trazabilidad');
  await db.clear('pedidos');
  await db.clear('pedido_items');
  const queue = await db.getAll('sync_queue');
  for (const item of queue) {
    if (['lista_precios', 'pedido', 'pedido_item'].includes(item.entity)) {
      await db.delete('sync_queue', item.id);
    }
  }
}

// â”€â”€ Precio Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function savePrecioItem(item) { return db.put('precio_items', item); }
export async function getPrecioItem(id) { return db.get('precio_items', id); }
export async function getPrecioItemsByLista(listaId) {
  return db.getAllFromIndex('precio_items', 'lista_id', listaId);
}
export async function getPrecioItemsByProduct(productId) {
  return db.getAllFromIndex('precio_items', 'product_id', productId);
}

// â”€â”€ DinÃ¡mica Comercial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveDinamica(dinamica) { return db.put('dinamica_comercial', dinamica); }
export async function getDinamica(id) { return db.get('dinamica_comercial', id); }
export async function getAllDinamicasDB() {
  const all = await db.getAll('dinamica_comercial');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// â”€â”€ DinÃ¡mica AuditorÃ­a â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveDinamicaAudit(entry) { return db.put('dinamica_auditoria', entry); }
export async function getDinamicaAuditByDinamica(dinamicaId) {
  const all = await db.getAllFromIndex('dinamica_auditoria', 'dinamica_id', dinamicaId);
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// â”€â”€ Proveedores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveProveedor(p) { return db.put('proveedores', p); }
export async function getProveedor(id) { return db.get('proveedores', id); }
export async function getAllProveedores() {
  const all = await db.getAll('proveedores');
  return all.sort((a, b) => (a.razon_social ?? '').localeCompare(b.razon_social ?? '', 'es'));
}

// â”€â”€ Event Store (v13 overlay â€” ConstituciÃ³n Â§4 Trazabilidad) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveEventToStore(entry) {
  try {
    return await db.add('event_store', entry);
  } catch (err) {
    if (err?.name === 'ConstraintError') return null;
    throw err;
  }
}
export async function getRecentEvents(limit = 500) {
  const all = await db.getAll('event_store');
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}
export async function getEventsByType(type, limit = 200) {
  const all = await db.getAllFromIndex('event_store', 'type', type);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}
export async function markEventReplayed(eventId) {
  const ev = await db.get('event_store', eventId);
  if (!ev) return;
  return db.put('event_store', { ...ev, replayed: true, replayed_at: new Date().toISOString() });
}

// â”€â”€ Compras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveCompra(c) { return db.put('compras', c); }
export async function getCompra(id) { return db.get('compras', id); }
export async function getAllCompras() {
  const all = await db.getAll('compras');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// â”€â”€ Compra Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveCompraItem(item) { return db.put('compra_items', item); }
export async function getCompraItem(id) { return db.get('compra_items', id); }
export async function getCompraItemsByCompra(compraId) {
  return db.getAllFromIndex('compra_items', 'compra_id', compraId);
}
export async function deleteCompraItem(id) { return db.delete('compra_items', id); }

// â”€â”€ Config Compras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function saveConfigCompras(cfg) { return db.put('config_compras', cfg); }
export async function getConfigCompras() { return db.get('config_compras', 'maxgrifos'); }

// â”€â”€ RBAC Audit Log (v16 â€” append-only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// add() en lugar de put() garantiza semÃ¡ntica append-only:
// un id duplicado lanza ConstraintError en lugar de sobreescribir.
export async function saveRbacAuditEntry(entry) {
  try {
    return await db.add('rbac_audit_log', entry);
  } catch (err) {
    if (err?.name === 'ConstraintError') return null; // duplicado, ignorar
    throw err;
  }
}

export async function getRbacAuditLog(limit = 500) {
  const all = await db.getAll('rbac_audit_log');
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export async function getRbacAuditByAction(action, limit = 200) {
  const all = await db.getAllFromIndex('rbac_audit_log', 'action', action);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export async function getRbacAuditByResult(result, limit = 200) {
  const all = await db.getAllFromIndex('rbac_audit_log', 'result', result);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export async function getRbacAuditByUser(user, limit = 200) {
  const all = await db.getAllFromIndex('rbac_audit_log', 'user', user);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

export async function getRbacAuditByRange(fromISO, toISO, limit = 1000) {
  const range = IDBKeyRange.bound(fromISO, toISO, false, false);
  const all = await db.getAllFromIndex('rbac_audit_log', 'timestamp', range);
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
}

// -- Export completo de datos (backup seguro) ---------------------------------
export async function exportAllData() {
  let exportDb = db;
  let ownConnection = false;
  if (!exportDb) {
    exportDb = await openDB(DB_NAME);
    ownConnection = true;
  }
  const snapshot = {
    exportedAt: new Date().toISOString(),
    dbVersion: exportDb.version,
    stores: {},
  };
  for (const storeName of ALL_STORES) {
    if (!exportDb.objectStoreNames.contains(storeName)) {
      snapshot.stores[storeName] = { status: 'no_existe', records: [] };
      continue;
    }
    try {
      snapshot.stores[storeName] = { status: 'ok', records: await exportDb.getAll(storeName) };
    } catch (err) {
      snapshot.stores[storeName] = { status: 'error', error: err?.message ?? String(err), records: [] };
    }
  }
  if (ownConnection) exportDb.close();

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maxgrifos-backup-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  return snapshot;
}

// Backup silencioso para flujo de actualizacion de PWA (sin descarga manual).
export async function createUpdateSafetyBackup() {
  const backup = await _createPreUpgradeBackupSnapshot('manual_update_guard');
  return Boolean(backup);
}

// -- Reset manual - SOLO por accion explicita del usuario ----------------------
export async function resetDB(confirmationInput) {
  void confirmationInput;
  throw new Error('RESET_DB_DESHABILITADO_POR_SEGURIDAD: la eliminacion destructiva de IndexedDB fue bloqueada.');
}

// -- Garantías CRUD -----------------------------------------------------------
export async function saveGarantia(garantia) {
  return db.put('garantias', garantia);
}

export async function getGarantia(id) {
  return db.get('garantias', id);
}

export async function getAllGarantias() {
  const all = await db.getAll('garantias');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getGarantiasByEstado(estado) {
  return db.getAllFromIndex('garantias', 'estado', estado);
}

export { RESET_CONFIRMATION_PHRASE };
export function getLatestPreUpgradeBackupMeta() {
  const snapshot = _safeReadJSONFromLocalStorage(BACKUP_STORAGE_KEY);
  if (!snapshot) return null;
  return {
    created_at: snapshot.created_at ?? null,
    reason: snapshot.reason ?? null,
    db_version_detected: snapshot.db_version_detected ?? null,
    target_db_version: snapshot.target_db_version ?? null,
    counts: snapshot.counts ?? {},
  };
}

export function getDbSafetyStatus() {
  return _safeReadJSONFromLocalStorage(DB_SAFETY_STATUS_KEY);
}
