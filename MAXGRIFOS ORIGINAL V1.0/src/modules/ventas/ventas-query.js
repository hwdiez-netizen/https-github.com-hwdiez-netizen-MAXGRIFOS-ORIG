import { getAllDocumentos } from '../../db/local-db.js';
import { getClientes } from '../clientes/cliente-store.js';

function _getDateRange(periodo, fecha_inicio, fecha_fin) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (periodo === 'rango') return { desde: fecha_inicio, hasta: fecha_fin };

  if (periodo === 'semana') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { desde: d.toISOString().slice(0, 10), hasta: todayStr };
  }

  if (periodo === 'mes') {
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    return { desde: `${now.getFullYear()}-${mes}-01`, hasta: todayStr };
  }

  if (periodo === 'trimestre') {
    const quarter = Math.floor(now.getMonth() / 3);
    const firstMonth = String(quarter * 3 + 1).padStart(2, '0');
    return { desde: `${now.getFullYear()}-${firstMonth}-01`, hasta: todayStr };
  }

  if (periodo === 'semestre') {
    const half = now.getMonth() < 6 ? 1 : 7;
    return { desde: `${now.getFullYear()}-${String(half).padStart(2, '0')}-01`, hasta: todayStr };
  }

  return { desde: todayStr, hasta: todayStr };
}

export async function queryVentasResumen(params = {}) {
  const { periodo = 'mes', fecha_inicio, fecha_fin, cliente_id, forma_pago } = params;
  const { desde, hasta } = _getDateRange(periodo, fecha_inicio, fecha_fin);

  // Usar comparación ISO string: emitido_at empieza con fecha YYYY-MM-DD
  const desdePrefix = desde;
  const hastaPrefix = hasta;

  const [allDocs, allClientes] = await Promise.all([getAllDocumentos(), getClientes()]);
  const clienteMap = new Map(allClientes.map((c) => [c.id, c]));

  const docs = allDocs.filter((doc) => {
    if (doc.estado !== 'emitido') return false;
    const emitidoDate = (doc.emitido_at ?? '').slice(0, 10);
    if (emitidoDate < desdePrefix || emitidoDate > hastaPrefix) return false;
    if (cliente_id && doc.cliente_id !== cliente_id) return false;
    if (forma_pago) {
      const cli = clienteMap.get(doc.cliente_id);
      if (!cli || cli.forma_pago !== forma_pago) return false;
    }
    return true;
  });

  const totalBruto = docs.reduce((s, d) => s + Number(d.total ?? 0), 0);
  const totalDocumentos = docs.length;

  // Vista por cliente
  const byCliente = new Map();
  for (const doc of docs) {
    const key = doc.cliente_id ?? 'DESCONOCIDO';
    if (!byCliente.has(key)) {
      byCliente.set(key, {
        cliente_id: doc.cliente_id,
        cliente_nombre: doc.cliente_nombre ?? '—',
        cliente_nit: doc.cliente_nit ?? '',
        documentos: 0,
        total: 0,
        items: [],
      });
    }
    const entry = byCliente.get(key);
    entry.documentos++;
    entry.total += Number(doc.total ?? 0);
    for (const item of doc.items_snapshot ?? []) {
      entry.items.push({
        product_id: item.product_id,
        product_name: item.product_name ?? '—',
        product_sku: item.product_sku ?? '—',
        cantidad: Number(item.cantidad ?? 0),
        precio_unitario: Number(item.precio_unitario ?? 0),
        subtotal: Number(item.subtotal ?? 0),
      });
    }
  }
  const vistaCliente = [...byCliente.values()].sort((a, b) => b.total - a.total);

  // Vista por producto
  const byProducto = new Map();
  for (const doc of docs) {
    for (const item of doc.items_snapshot ?? []) {
      const key = item.product_id ?? item.product_sku ?? 'DESCONOCIDO';
      if (!byProducto.has(key)) {
        byProducto.set(key, {
          product_id: item.product_id,
          product_name: item.product_name ?? '—',
          product_sku: item.product_sku ?? '—',
          cantidad_total: 0,
          total: 0,
          _sum_precio: 0,
          _count: 0,
        });
      }
      const entry = byProducto.get(key);
      entry.cantidad_total += Number(item.cantidad ?? 0);
      entry.total += Number(item.subtotal ?? 0);
      entry._sum_precio += Number(item.precio_unitario ?? 0);
      entry._count++;
    }
  }
  const vistaProducto = [...byProducto.values()].map((p) => ({
    product_id: p.product_id,
    product_name: p.product_name,
    product_sku: p.product_sku,
    cantidad_total: p.cantidad_total,
    precio_promedio: p._count > 0 ? p._sum_precio / p._count : 0,
    total: p.total,
  })).sort((a, b) => b.total - a.total);

  // Vista por forma de pago
  const byFormaPago = new Map();
  for (const doc of docs) {
    const cli = clienteMap.get(doc.cliente_id);
    const fp = cli?.forma_pago || 'SIN CLASIFICAR';
    if (!byFormaPago.has(fp)) {
      byFormaPago.set(fp, { forma_pago: fp, total: 0, documentos: 0 });
    }
    const entry = byFormaPago.get(fp);
    entry.total += Number(doc.total ?? 0);
    entry.documentos++;
  }
  const vistaFormaPago = [...byFormaPago.values()].map((fp) => ({
    ...fp,
    participacion: totalBruto > 0 ? (fp.total / totalBruto) * 100 : 0,
  })).sort((a, b) => b.total - a.total);

  return {
    periodo,
    desde,
    hasta,
    total_bruto: totalBruto,
    total_documentos: totalDocumentos,
    vista_cliente: vistaCliente,
    vista_producto: vistaProducto,
    vista_forma_pago: vistaFormaPago,
    clientes_activos: allClientes.filter((c) => (c.status ?? 'active') === 'active'),
  };
}
