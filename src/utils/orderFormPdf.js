'use strict';

const PDFDocument = require('pdfkit');

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const safeText = (value) => (value == null || value === '' ? '____________________' : String(value));

const normalizeBatchEntries = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeBatchEntries(parsed);
    } catch {
      return [];
    }
  }

  if (typeof value === 'object') return [value];
  return [];
};

const formatBatchDetails = (value) => {
  const entries = normalizeBatchEntries(value);
  const details = entries.map((entry) => {
    const batchNo = entry?.batch_no || entry?.batchNo || entry?.batch || entry?.batch_id || entry?.id || '';
    const qty = entry?.allocated_qty ?? entry?.qty ?? entry?.hide_qty ?? entry?.hide_quantity ?? entry?.quantity ?? '';

    if (batchNo && qty !== '' && qty !== null && qty !== undefined) {
      return `Batch ${batchNo} - ${qty} Sq.ft`;
    }

    if (batchNo) {
      return `Batch ${batchNo}`;
    }

    if (qty !== '' && qty !== null && qty !== undefined) {
      return `${qty} Sq.ft`;
    }

    return '';
  });

  return details.filter(Boolean).join(' | ');
};

module.exports = function generateOrderFormPdf(res, orderForm) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${orderForm.order_number || 'order-form'}.pdf`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let y = 34;
  const fieldGap = 16;
  const rowHeight = 16;
  const cellGap = 15;

  const line = (topY, label, value, labelWidth = 96, valueWidth = 270) => {
    doc.font('Helvetica-Bold').fontSize(11).text(label, left, topY, { width: labelWidth });
    doc.font('Helvetica').fontSize(10.5).text(safeText(value), left + labelWidth + 12, topY, { width: valueWidth, lineGap: 2 });
  };

  const tableRow = (topY, columns, fontSize = 10, widths = null, aligns = null) => {
    let x = left + 8;
    const resolvedWidths = widths || columns.map(() => (pageWidth - 16 - cellGap * (columns.length - 1)) / columns.length);
    columns.forEach((text, index) => {
      const width = resolvedWidths[index];
      const alignment = aligns && aligns[index] ? aligns[index] : index === columns.length - 1 ? 'right' : 'left';
      doc.font('Helvetica').fontSize(fontSize).text(text, x, topY, { width, align: alignment, lineGap: 1.5 });
      x += width + cellGap;
    });
  };

  const sectionTitle = (text, topY) => {
    doc.font('Helvetica-Bold').fontSize(11).text(text, left, topY);
  };

  const drawDivider = (topY) => {
    doc.moveTo(left, topY).lineTo(right, topY).stroke();
  };

  const drawFieldPair = (topY, leftLabel, leftValue, rightLabel, rightValue, leftLabelWidth = 86, rightLabelWidth = 92, leftValueWidth = 160, rightValueWidth = 160) => {
    const leftX = left;
    const rightX = left + 260;

    doc.font('Helvetica-Bold').fontSize(10).text(leftLabel, leftX, topY, { width: leftLabelWidth });
    doc.font('Helvetica').fontSize(10).text(safeText(leftValue), leftX + leftLabelWidth + 6, topY, { width: leftValueWidth, lineGap: 1.4 });

    doc.font('Helvetica-Bold').fontSize(10).text(rightLabel, rightX, topY, { width: rightLabelWidth });
    doc.font('Helvetica').fontSize(10).text(safeText(rightValue), rightX + rightLabelWidth + 6, topY, { width: rightValueWidth, lineGap: 1.4 });
  };

  doc.font('Helvetica-Bold').fontSize(22).text('ORDER FORM', { align: 'center' });
  y += 12;

  line(y, 'Order No.:', orderForm.order_number || '____________________', 78, 210);
  line(y + fieldGap, 'Order Date:', formatDate(orderForm.order_date) || '05/06/2026', 78, 210);
  line(y + fieldGap * 2, 'Location:', orderForm.location || 'HYD', 78, 210);
  line(y + fieldGap * 3, 'PI Time:', formatDateTime(orderForm.createdAt || orderForm.pi_created_at), 78, 210);
  y += 72;

  line(y, 'Customer / Company:', orderForm.customer_name || orderForm.company_name || '____________________', 124, 280);
  line(y + fieldGap, 'Contact Person:', orderForm.contact_number || '___________________________', 124, 280);
  line(y + fieldGap * 2, 'City:', orderForm.city || '___________________________', 124, 280);
  y += 54;

  sectionTitle('ITEM DETAILS', y);
  y += 12;

  const itemHeaders = ['Sl. No.', 'Item Description', 'Qty.'];
  tableRow(y, itemHeaders, 9, [48, 360, 82], ['left', 'left', 'right']);
  y += 14;
  drawDivider(y - 4);

  (orderForm.items || []).forEach((item, index) => {
    const description = item.description || item.product?.leather_code || item.product?.color || '';
    const qty = item.qty ? `${item.qty} Sq.ft` : '';
    const batchDetails = formatBatchDetails(item.suggested_batches ?? item.batch_info);

    tableRow(y, [`${String(index + 1).padStart(2, '0')}`, description, qty], 10, [48, 360, 82], ['left', 'left', 'right']);
    if (batchDetails) {
      doc.font('Helvetica-Oblique').fontSize(9).text(`Allocation: ${batchDetails}`, left + 18, y + rowHeight + 2, { width: pageWidth - 30, lineGap: 2 });
      y += 12;
    }
    y += rowHeight;
  });

  for (let i = (orderForm.items || []).length; i < 6; i += 1) {
    tableRow(y, [`${String(i + 1).padStart(2, '0')}`, '', ''], 10, [48, 360, 82], ['left', 'left', 'right']);
    y += rowHeight;
  }

  y += 10;
  line(y, 'GST @ 5%:', orderForm.gst_amount || '____________________', 84, 280);
  line(y + fieldGap, 'Amount Payable:', orderForm.amount_payable || '____________________', 104, 260);
  y += 52;

  sectionTitle('CLUNCH DETAILS', y);
  y += 12;

  const clunchColumnWidth = (pageWidth - 16 - cellGap) / 2;
  const clunchColumns = ['Sq. Ft.', 'Bar Code'];
  tableRow(y, clunchColumns, 10, [clunchColumnWidth, clunchColumnWidth], ['left', 'left']);
  y += 12;
  drawDivider(y - 4);

  const hideRows = Array.isArray(orderForm.items)
    ? orderForm.items.flatMap((item) => normalizeBatchEntries(item.suggested_batches ?? item.batch_info).map((batch) => ({
        sqft: batch?.allocated_qty ?? batch?.qty ?? batch?.hide_qty ?? batch?.quantity ?? '',
        barcode: batch?.batch_no || batch?.hide_id || batch?.barcode || batch?.id || '',
      })))
    : [];

  if (hideRows.length === 0) {
    hideRows.push({ sqft: '', barcode: '' }, { sqft: '', barcode: '' }, { sqft: '', barcode: '' });
  }

  hideRows.slice(0, 8).forEach((row) => {
    tableRow(y, [row.sqft, row.barcode], 10, [clunchColumnWidth, clunchColumnWidth], ['left', 'left']);
    y += 12;
  });

  y += 10;
  drawFieldPair(y, 'Packed By:', orderForm.packed_by || '____________________', 'Dispatched By:', orderForm.dispatched_by || '____________________');
  drawFieldPair(y + fieldGap, 'Transporter Name:', orderForm.transporter_name || '____________________', 'Transport Type:', orderForm.transport_type || '____________________');
  drawFieldPair(y + fieldGap * 2, 'Forwarding Charges:', orderForm.forwarding_charges || '____________________', 'Docket Number:', orderForm.docket_number || '____________________');

  doc.end();
};
