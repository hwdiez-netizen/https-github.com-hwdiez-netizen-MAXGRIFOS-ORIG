import { checkEnterprisePermiso, resolveEnterpriseCtx } from '../../../handlers/rbac-enterprise.js';
import { logRbacAction } from '../../../handlers/rbac-audit.js';
import {
  getCompraItemsByCompra,
  getAllCompras,
  getAllProveedores,
} from '../../../db/local-db.js';
import { getProducts, createProduct } from '../../maestro-productos/product-store.js';
import { getBodegas, BODEGA_CENTRAL_ID } from '../../kardex/bodega-store.js';
import {
  buildCompraKey,
  buildCompraItemKey,
  ensureOrdenUnica,
  validateCrearCompra,
  validateRecepcionarCompra,
} from '../compra-contracts.js';
import {
  guardarCompra as _guardarCompra,
  recibirCompra as _recibirCompra,
} from '../compra-store.js';

function _audit(action, ctx) {
  const effectiveCtx = resolveEnterpriseCtx(ctx);
  const base = {
    user: effectiveCtx?.user ?? null,
    role: effectiveCtx?.role ?? null,
    action,
  };

  try {
    checkEnterprisePermiso(action, effectiveCtx);
    logRbacAction({ ...base, result: 'ALLOW' });
  } catch (error) {
    logRbacAction({ ...base, result: 'DENY' });
    throw error;
  }
}

export async function handlePrepararFormularioCompra({ compra = null, bodegaDefaultId = BODEGA_CENTRAL_ID } = {}, ctx) {
  _audit('prepararFormularioCompra', ctx);

  const [productsRaw, proveedores, bodegas] = await Promise.all([
    getProducts(),
    getAllProveedores(),
    getBodegas(),
  ]);

  const products = productsRaw.filter((p) => p.status === 'active');
  const items = compra ? await getCompraItemsByCompra(compra.id) : [];
  const selectedProv = compra ? proveedores.find((p) => p.id === compra.proveedor_id) ?? null : null;
  const selectedBodegaId = compra?.bodega_destino ?? bodegaDefaultId;

  return { products, proveedores, bodegas, items, selectedProv, selectedBodegaId };
}

async function nextConsecutivo() {
  const all = await getAllCompras();
  const max = all.reduce((m, c) => {
    const n = parseInt((c.consecutivo ?? '').replace(/\D/g, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  const year = new Date().getFullYear();
  return `OC-${year}-${String(max + 1).padStart(4, '0')}`;
}

export async function handleGuardarCompra(command, ctx) {
  _audit('guardarCompra', ctx);

  const compra = command.compra ?? null;
  const proveedorId = command.proveedorId || compra?.proveedor_id;
  const items = command.items ?? [];

  validateCrearCompra(proveedorId, items);

  const consecutivo = compra?.consecutivo ?? await nextConsecutivo();
  if (!compra) await ensureOrdenUnica(consecutivo);

  const proveedor = command.proveedor;
  const totalSub = items.reduce((s, i) => s + (Number(i.cantidad) * Number(i.costo_unitario)), 0);
  const iva = Math.round(totalSub * 0.19);
  const total = totalSub + iva;

  const compraData = {
    ...compra,
    id: compra?.id ?? buildCompraKey(consecutivo),
    created_at: compra?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: compra?.created_by ?? 'usuario',
    updated_by: 'usuario',
    version: Number(compra?.version ?? 0) + 1,
    status: compra?.status ?? 'active',
    sync_status: (typeof navigator !== 'undefined' && navigator.onLine) ? 'pending' : 'offline',
    idempotency_key: compra?.idempotency_key ?? buildCompraKey(consecutivo),
    consecutivo,
    proveedor_id: proveedor?.id ?? proveedorId,
    proveedor_nombre: proveedor?.razon_social ?? compra?.proveedor_nombre ?? '',
    proveedor_nit: proveedor?.nit ?? compra?.proveedor_nit ?? '',
    forma_pago: command.forma_pago ?? compra?.forma_pago ?? 'CONTADO',
    factura_proveedor: command.factura_proveedor ?? compra?.factura_proveedor ?? '',
    bodega_destino: command.bodega_destino ?? compra?.bodega_destino ?? BODEGA_CENTRAL_ID,
    subtotal: totalSub,
    iva,
    total,
    estado: compra?.estado ?? 'borrador',
  };

  const normalizedItems = items.map((it) => ({
    ...it,
    id: it.id ?? buildCompraItemKey(compraData.id, it.product_id),
    compra_id: compraData.id,
    created_at: it.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    sync_status: 'pending',
    idempotency_key: it.idempotency_key ?? buildCompraItemKey(compraData.id, it.product_id),
  }));

  return await _guardarCompra({ compra: compraData, items: normalizedItems }, { __fromHandler: true });
}

export async function handleCrearProductoDesdeCompra(command, ctx) {
  _audit('crearProductoDesdeCompra', ctx);
  return await createProduct(command);
}

export async function handleRecibirCompra(data, ctx) {
  _audit('recibirCompra', ctx);
  validateRecepcionarCompra(data?.compra, data?.factura_proveedor ?? '');
  return await _recibirCompra(data, { __fromHandler: true });
}
