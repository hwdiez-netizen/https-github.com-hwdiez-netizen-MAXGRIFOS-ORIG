import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { handleRegistrarReimpresion } from './comprobantes-handlers.js';

const PRIMARY = [26, 86, 219];
const DARK    = [17, 24, 39];
const GRAY    = [107, 114, 128];
const LIGHT   = [243, 244, 246];

async function _qrDataUrl(text, size = 120) {
  return QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: '#111827', light: '#ffffff' } });
}

export async function generarYDescargarPDF(documento, items, esReimpresion = false) {
  const esReimpresionReal = esReimpresion || (documento.reimpresiones ?? 0) > 0;

  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const tipo = documento.tipo === 'FAC' ? 'FACTURA DE VENTA' : 'REMISIÓN DE ENTREGA';

  // ── Marca de agua COPIA ─────────────────────────────────
  if (esReimpresionReal) {
    doc.setFontSize(72);
    doc.setTextColor(220, 220, 220);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.25 }));
    doc.text('COPIA', W / 2, H / 2, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();
  }

  // ── Encabezado ──────────────────────────────────────────
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 28, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('MaxGrifos ERP', 14, 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('ERP-CRM-WMS Integrado', 14, 18);
  doc.text(tipo, 14, 24);

  // Consecutivo y fecha
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(documento.consecutivo, W - 14, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const fechaEmision = new Date(documento.emitido_at).toLocaleDateString('es-CO', { dateStyle: 'long' });
  doc.text(`Emitido: ${fechaEmision}`, W - 14, 18, { align: 'right' });
  if (esReimpresionReal) doc.text('DOCUMENTO REIMPRESO', W - 14, 24, { align: 'right' });

  let y = 36;

  // ── Datos cliente ───────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.rect(14, y, W - 28, 22, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL CLIENTE', 18, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${documento.cliente_nombre}`, 18, y + 12);
  if (documento.cliente_nit) doc.text(`NIT: ${documento.cliente_nit}`, 18, y + 18);

  // QR en esquina superior derecha del bloque de cliente
  try {
    const qrUrl = await _qrDataUrl(documento.qr_data, 100);
    doc.addImage(qrUrl, 'PNG', W - 38, y, 24, 24);
  } catch { /* QR no disponible offline — omitir */ }

  y += 30;

  // ── Tabla de ítems ──────────────────────────────────────
  autoTable(doc, {
    startY:     y,
    margin:     { left: 14, right: 14 },
    head:       [['SKU', 'Descripción', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body:       items.map((i) => [
      i.product_sku,
      i.product_name,
      i.cantidad ?? i.cantidad_picking,
      `$${(i.precio_unitario).toLocaleString('es-CO')}`,
      `$${(i.subtotal ?? (i.cantidad_picking * i.precio_unitario)).toLocaleString('es-CO')}`,
    ]),
    foot:       [['', '', '', 'TOTAL', `$${documento.total.toLocaleString('es-CO')}`]],
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: LIGHT,   textColor: DARK, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { cellWidth: 28 }, 2: { halign: 'center', cellWidth: 16 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Pie: código QR + texto legal ────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text('Este documento fue generado por MaxGrifos ERP. Es inmutable — cualquier alteración lo invalida.', 14, H - 16);
  doc.text(`Consecutivo: ${documento.consecutivo} | ID: ${documento.id}`, 14, H - 11);
  if (documento.estado === 'anulado') {
    doc.setTextColor(224, 36, 36);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DOCUMENTO ANULADO', W / 2, H - 20, { align: 'center' });
    if (documento.motivo_anulacion) doc.setFontSize(9) && doc.text(`Motivo: ${documento.motivo_anulacion}`, W / 2, H - 14, { align: 'center' });
  }

  // ── Guardar y descargar ─────────────────────────────────
  const filename = `${documento.consecutivo}${esReimpresionReal ? '-COPIA' : ''}.pdf`;
  doc.save(filename);

  // Registrar reimpresión si aplica
  if (esReimpresion) await handleRegistrarReimpresion({ documento_id: documento.id });

  return filename;
}
