const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const PI_CONST = require("../../config/pi.constants");
const { COMPANY } = require("../constants/company.constants");

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function amountInWords(num) {
  const a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  const w = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + w(n % 100) : "");
    if (n < 100000) return w(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + w(n % 1000) : "");
    if (n < 10000000) return w(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + w(n % 100000) : "");
    return w(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + w(n % 10000000) : "");
  };

  const n = Math.abs(num);
  const integerPart = Math.floor(n);
  const fractionPart = Math.round((n - integerPart) * 100);
  let words = w(integerPart) ? w(integerPart) + " Rupees" : "";
  if (fractionPart) {
    words += (words ? " and " : "") + w(fractionPart) + " Paise";
  }

  return `Rs. ${words} Only`;
}

module.exports = function generateExactPIPdf(res, pi) {
  console.log("PI DATA FOR PDF:", {
    id: pi.id,
    shipping_address: pi.shipping_address,
    billing_address: pi.billing_address,
    delivery_address: pi.delivery_address,
    address: pi.address
  });

  // Check if it's Vitton collection
  const isVitton = pi.items.some(item => 
    item.product?.series?.subCollection?.mainCollection?.name?.toLowerCase().includes('vitton')
  );

  const doc = new PDFDocument({
    size: "A4",
    margin: 40
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=PI-${pi.id}.pdf`);

  doc.pipe(res);

  /* ---------- COMPLETE PAGE BORDER (drawn first, behind content) ---------- */
  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const contentWidth = pageRight - pageLeft;
  const borderTop = doc.page.margins.top;
  const borderLeft = pageLeft;
  const borderWidth = contentWidth;
  const borderHeight = doc.page.height - (doc.page.margins.top + doc.page.margins.bottom);
  doc.lineWidth(0.5).rect(borderLeft - 5, borderTop - 5, borderWidth + 10, borderHeight + 10).stroke();

  const isWestern = pi.company_name === COMPANY.WESTERN;
  const company = isWestern
    ? PI_CONST.COMPANIES.WESTERN
    : PI_CONST.COMPANIES.MARVIN;

  const sameState =
    pi.state?.toLowerCase().trim() ===
    company.state?.toLowerCase().trim();

  let y = 40;

  /* ---------- PAGE TITLE ---------- */
  doc.font("Helvetica-Bold").fontSize(14).text("Proforma Invoice", pageLeft, borderTop - 28, {
    width: contentWidth,
    align: "center",
  });

  /* ---------- HEADER (table-based) ---------- */
  // pageLeft, pageRight, contentWidth already defined in border section above

  const headerHeight = 170;
  const colAWidth = contentWidth * 0.4;
  const colBWidth = contentWidth * 0.3;
  const colCWidth = contentWidth * 0.3;
  const colAX = pageLeft;
  const colBX = colAX + colAWidth;
  const colCX = colBX + colBWidth;

  doc.lineWidth(1).rect(pageLeft, y, contentWidth, headerHeight).stroke();
  doc.moveTo(colBX, y).lineTo(colBX, y + headerHeight).stroke();
  doc.moveTo(colCX, y).lineTo(colCX, y + headerHeight).stroke();

  // Company block
  const logoPath = path.resolve(__dirname, `../../assets/${isWestern ? 'western-logo.png' : 'marvin-logo.png'}`);
  const logoWidth = 60;
  const logoX = colAX + 4;
  const textX = logoX + logoWidth + 8;
  const textWidth = colAWidth - logoWidth - 12;
  
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, logoX, y + 4, { width: logoWidth, height: 80 });
  }

  doc.font("Helvetica-Bold").fontSize(8).text(company.name.toUpperCase(), textX, y + 4, { width: textWidth });
  doc.font("Helvetica").fontSize(7).text(company.address, textX, y + 25, { width: textWidth, align: "left" });
  doc.text(`GSTIN/UIN: ${company.gstin}`, textX, y + 52, { width: textWidth });
  doc.text(`State Name: ${company.state}, Code: ${company.stateCode}`, textX, y + 62, { width: textWidth });
  doc.text(`E-Mail: ${company.email}`, textX, y + 72, { width: textWidth });

  // Middle invoice info
  const invoiceDate = new Date(pi.createdAt || new Date());
  const invoiceYear = invoiceDate.getFullYear();
  const fyStart = String(invoiceYear % 100).padStart(2, "0");
  const fyEnd = String((invoiceYear + 1) % 100).padStart(2, "0");
  const financialYear = `${fyStart}${fyEnd}`;
  const invoiceIdNumber = Number(pi.id) - 105;
  const invoiceNo = `${isWestern ? "WC/PI/2526/" : "MLM/PI/"}${financialYear}/${invoiceIdNumber}`;

  const invoiceFields = [
    ["Proforma Invoice No", invoiceNo],
  ].filter(([, value]) => value && String(value).trim() !== "-");

  let invY = y + 4;
  invoiceFields.forEach(([label, value]) => {
    doc.font("Helvetica").fontSize(8).text(`${label}:`, colBX + 4, invY, { continued: true });
    doc.font("Helvetica-Bold").text(` ${value}`);
    invY += 11;
  });

  // Add labels below Invoice No in the box
  doc.font("Helvetica").fontSize(7);
  doc.text("Delivery Note", colBX + 4, invY);
  invY += 10;
  doc.text("Reference No", colBX + 4, invY);
  invY += 10;
  doc.text("Buyer's Order No", colBX + 4, invY);
  invY += 10;
  doc.text("Dispatch Doc No", colBX + 4, invY);
  invY += 10;
  doc.text("Dispatched Through", colBX + 4, invY);

  // Right dates/terms
  const rightFields = [
    ["Dated", formatDate(pi.createdAt)],
  ].filter(([, value]) => value && String(value).trim() !== "-");

  doc.font("Helvetica-Bold").fontSize(9).text("Dates/Terms", colCX + 4, y + 4);
  let rightY = y + 18;
  rightFields.forEach(([label, value]) => {
    doc.font("Helvetica").fontSize(8).text(`${label}:`, colCX + 4, rightY, { continued: true });
    doc.font("Helvetica-Bold").text(` ${value}`);
    rightY += 11;
  });

  // Add labels below Dated in the box
  doc.font("Helvetica").fontSize(7);
  doc.text("Mode of Payment", colCX + 4, rightY);
  rightY += 10;
  doc.text("Other References", colCX + 4, rightY);
  rightY += 10;
  doc.text("Dated", colCX + 4, rightY);
  rightY += 10;
  doc.text("Delivery Note Date", colCX + 4, rightY);
  rightY += 10;
  doc.text("Destination", colCX + 4, rightY);

  y += headerHeight;

  const storeAddress = (addr) => (addr || "").replace(/\n/g, ", ");

  /* ---------- PARTY DETAILS ---------- */
  const partySectionHeight = 200;
  doc.lineWidth(1).rect(pageLeft, y, contentWidth, partySectionHeight).stroke();
  doc.moveTo(pageLeft, y + partySectionHeight / 2).lineTo(pageRight, y + partySectionHeight / 2).stroke();

  const pY = y + 6;
  const partyLineHeight = 14;

  doc.font("Helvetica-Bold").fontSize(9).text("Consignee (Ship to)", pageLeft + 4, pY);
  doc.font("Helvetica").fontSize(8).text(pi.customer_name, pageLeft + 4, pY + partyLineHeight);
  doc.text(storeAddress(pi.shipping_address || pi.delivery_address || pi.billing_address), pageLeft + 4, pY + 2 * partyLineHeight, { width: contentWidth - 8 });
  doc.text(`GSTIN/UIN: ${pi.gst_number || "-"}`, pageLeft + 4, pY + 3.5 * partyLineHeight);
  doc.text(`State: ${pi.state || "-"}`, pageLeft + 4, pY + 4.5 * partyLineHeight);
  doc.text(`Contact: ${pi.contact || "-"}`, pageLeft + 4, pY + 5.5 * partyLineHeight);

  doc.font("Helvetica-Bold").fontSize(9).text("Buyer (Bill to)", pageLeft + 4, y + partySectionHeight / 2 + 6);
  doc.font("Helvetica").fontSize(8).text(pi.customer_name, pageLeft + 4, y + partySectionHeight / 2 + 6 + partyLineHeight);
  doc.text(storeAddress(pi.billing_address || pi.delivery_address), pageLeft + 4, y + partySectionHeight / 2 + 6 + 2 * partyLineHeight, { width: contentWidth - 8 });
  doc.text(`GSTIN/UIN: ${pi.gst_number || "-"}`, pageLeft + 4, y + partySectionHeight / 2 + 6 + 3.5 * partyLineHeight);
  doc.text(`State: ${pi.state || "-"}`, pageLeft + 4, y + partySectionHeight / 2 + 6 + 4.5 * partyLineHeight);
  doc.text(`Contact: ${pi.contact || "-"}`, pageLeft + 4, y + partySectionHeight / 2 + 6 + 5.5 * partyLineHeight);

  y += partySectionHeight;

  /* ---------- ITEMS TABLE ---------- */
  const colWidths = {
    sl: Math.floor(contentWidth * 0.05),
    desc: Math.floor(contentWidth * 0.35),
    hsn: Math.floor(contentWidth * 0.1),
    qty: Math.floor(contentWidth * 0.1),
    rate: Math.floor(contentWidth * 0.1),
    per: Math.floor(contentWidth * 0.05),
    disc: Math.floor(contentWidth * 0.05),
    amt: Math.floor(contentWidth * 0.2),
  };

  const xSel = pageLeft;
  const xDesc = xSel + colWidths.sl;
  const xHsn = xDesc + colWidths.desc;
  const xQty = xHsn + colWidths.hsn;
  const xRate = xQty + colWidths.qty;
  const xPer = xRate + colWidths.rate;
  const xDisc = xPer + colWidths.per;
  const xAmt = xDisc + colWidths.disc;

  const tableTop = y;
  const rowHeight = 18;

  doc.lineWidth(1).rect(pageLeft, tableTop, contentWidth, rowHeight).stroke();
  doc.moveTo(xDesc, tableTop).lineTo(xDesc, tableTop + rowHeight).stroke();
  doc.moveTo(xHsn, tableTop).lineTo(xHsn, tableTop + rowHeight).stroke();
  doc.moveTo(xQty, tableTop).lineTo(xQty, tableTop + rowHeight).stroke();
  doc.moveTo(xRate, tableTop).lineTo(xRate, tableTop + rowHeight).stroke();
  doc.moveTo(xPer, tableTop).lineTo(xPer, tableTop + rowHeight).stroke();
  doc.moveTo(xDisc, tableTop).lineTo(xDisc, tableTop + rowHeight).stroke();

  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Sl No", xSel + 2, y + 4);
  doc.text("Description", xDesc + 2, y + 4);
  doc.text("HSN/SAC", xHsn + 2, y + 4);
  doc.text("Quantity", xQty + 2, y + 4);
  doc.text("Rate", xRate + 2, y + 4);
  doc.text("per", xPer + 2, y + 4);
  doc.text("Disc %", xDisc + 2, y + 4);
  doc.text("Amount", xAmt + 2, y + 4, { width: colWidths.amt - 4, align: "right" });

  y += rowHeight;

  let subtotal = 0;

  const transportCharge = Number(pi.transport_amount || 0);
  const transportGstPercent = 5;
  const transportGst = transportCharge > 0 ? (transportCharge * transportGstPercent / 100) : 0;

  doc.font("Helvetica").fontSize(9);

  pi.items.forEach((item, i) => {
    const rate = item.rate || 0;
    const qty = item.qty || 0;
    const amount = rate * qty;
    subtotal += amount;

    doc.lineWidth(0.5).rect(pageLeft, y, contentWidth, rowHeight).stroke();
    doc.moveTo(xDesc, y).lineTo(xDesc, y + rowHeight).stroke();
    doc.moveTo(xHsn, y).lineTo(xHsn, y + rowHeight).stroke();
    doc.moveTo(xQty, y).lineTo(xQty, y + rowHeight).stroke();
    doc.moveTo(xRate, y).lineTo(xRate, y + rowHeight).stroke();
    doc.moveTo(xPer, y).lineTo(xPer, y + rowHeight).stroke();
    doc.moveTo(xDisc, y).lineTo(xDisc, y + rowHeight).stroke();

    doc.font("Helvetica").text(String(i + 1), xSel + 2, y + 3);
    doc.font("Helvetica-Bold").text(`${item.product?.leather_code || ""} ${item.product?.color || ""}`, xDesc + 2, y + 3, { width: colWidths.desc - 4 });
    doc.font("Helvetica").text(isVitton ? "56039400" : (item.product?.hsn_code || "41079100"), xHsn + 2, y + 3);
    doc.text(`${qty.toFixed(2)} ${isVitton ? "MTR" : "SQF"}`, xQty + 2, y + 3);
    doc.text(rate.toFixed(2), xRate + 2, y + 3);
    doc.text(isVitton ? "MTR" : "SQF", xPer + 2, y + 3);
    doc.text("-", xDisc + 2, y + 3);
    doc.text(amount.toFixed(2), xAmt + 2, y + 3, { width: colWidths.amt - 4, align: "right" });

    y += rowHeight;

    if (i === 0) {
      const extras = [
        ["Forwarding & Handling Charges", pi.forwarding_charges],
        ["Less: Rounded Off Balance", pi.round_off_balance],
      ].filter(([, value]) => value && Number(value) !== 0);

      extras.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(8).text(label, xDesc + 4, y + 2, { width: colWidths.desc - 6 });
        doc.text(Number(value).toFixed(2), xAmt + 2, y + 2, { width: colWidths.amt - 4, align: "right" });
        y += 14;
      });
    }
  });

  // bottom totals row for items
  doc.lineWidth(1).rect(pageLeft, y, contentWidth, rowHeight).stroke();
  doc.moveTo(xDesc, y).lineTo(xDesc, y + rowHeight).stroke();
  doc.moveTo(xHsn, y).lineTo(xHsn, y + rowHeight).stroke();
  doc.moveTo(xQty, y).lineTo(xQty, y + rowHeight).stroke();
  doc.moveTo(xRate, y).lineTo(xRate, y + rowHeight).stroke();
  doc.moveTo(xPer, y).lineTo(xPer, y + rowHeight).stroke();
  doc.moveTo(xDisc, y).lineTo(xDisc, y + rowHeight).stroke();

  doc.font("Helvetica-Bold").fontSize(9).text("Total", xDesc + 2, y + 3);
  doc.font("Helvetica-Bold").text(`${pi.total_qty?.toFixed(2) || (pi.items[0]?.qty || 0).toFixed(2)} ${isVitton ? "MTR" : "SQF"}`, xQty + 2, y + 3, { width: colWidths.qty, align: "center" });
  doc.text((subtotal + transportCharge).toFixed(2), xAmt + 2, y + 3, { width: colWidths.amt - 4, align: "right" });

  y += rowHeight;

  const taxableValue = subtotal + transportCharge;

  const cgstItems = sameState ? taxableValue * PI_CONST.CGST / 100 : 0;
  const sgstItems = sameState ? taxableValue * PI_CONST.SGST / 100 : 0;
  const igstItems = sameState ? 0 : taxableValue * PI_CONST.IGST / 100;

  const totalItemTax = cgstItems + sgstItems + igstItems;
  const combinedTaxAmount = totalItemTax;

  const total = taxableValue + combinedTaxAmount;

  const roundedTotal = Math.round(total);
  const roundOff = Number((roundedTotal - total).toFixed(2));
  const finalTotal = Number((total + roundOff).toFixed(2));

  doc.font("Helvetica");

  y += 10;  // Move Forwarding Charges down a bit

  if (transportCharge > 0) {
    doc.text("Forwarding Charges", 400, y);
    doc.text(`${transportCharge.toFixed(2)}`, 520, y, { align: "right" });
    y += 15;
  }

if (sameState) {
  doc.text(`CGST ${PI_CONST.CGST}%`, 400, y);
  doc.text(cgstItems.toFixed(2), 520, y, { align: "right" });
  y += 15;

  doc.text(`SGST ${PI_CONST.SGST}%`, 400, y);
  doc.text(sgstItems.toFixed(2), 520, y, { align: "right" });
  y += 15;
} else {
  doc.text(`IGST ${PI_CONST.IGST}%`, 400, y);
  doc.text(igstItems.toFixed(2), 520, y, { align: "right" });
  y += 15;
}

// forwarding GST is included in overall taxable value, so no separate line here

y += 5;

  /* ---------- TOTAL ---------- */

  doc.text("Round Off", 400, y);
  doc.text(roundOff.toFixed(2), 520, y, { align: "right" });
  y += 15;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Total", 400, y);

  doc.text(finalTotal.toFixed(2), 500, y, {
    align: "right"
  });

  y += 35;

  /* ---------- TAX SUMMARY TABLE ---------- */
  
  const hsnCode = isVitton ? "56039400" : (pi.items[0]?.product?.hsn_code || "41079100");
  const taxRate = sameState ? PI_CONST.CGST + PI_CONST.SGST : PI_CONST.IGST;
  const taxAmount = sameState ? (cgstItems + sgstItems) : igstItems;
  const displayTaxableValue = taxableValue;  // include forwarding in taxable base as requested

  const taxTableX = pageLeft;
  const taxTableY = y;
  const taxTableW = contentWidth;
  const taxCol1 = taxTableX;
  const taxCol2 = taxCol1 + (taxTableW * 0.25);
  const taxCol3 = taxCol2 + (taxTableW * 0.2);
  const taxCol4 = taxCol3 + (taxTableW * 0.2);
  const taxCol5 = taxCol4 + (taxTableW * 0.2);

  const taxRowHeight = 18;

  doc.lineWidth(1).rect(taxTableX, taxTableY, taxTableW, taxRowHeight * 2).stroke();
  doc.moveTo(taxCol2, taxTableY).lineTo(taxCol2, taxTableY + taxRowHeight * 2).stroke();
  doc.moveTo(taxCol3, taxTableY).lineTo(taxCol3, taxTableY + taxRowHeight * 2).stroke();
  doc.moveTo(taxCol4, taxTableY).lineTo(taxCol4, taxTableY + taxRowHeight * 2).stroke();
  doc.moveTo(taxCol5, taxTableY).lineTo(taxCol5, taxTableY + taxRowHeight * 2).stroke();

  doc.font("Helvetica-Bold").fontSize(9)
    .text("HSN/SAC", taxCol1 + 3, taxTableY + 4)
    .text("Taxable Value", taxCol2 + 3, taxTableY + 4)
    .text("Rate", taxCol3 + 3, taxTableY + 4)
    .text("IGST Amount", taxCol4 + 3, taxTableY + 4)
    .text("Total Tax Amount", taxCol5 + 3, taxTableY + 4);

  doc.font("Helvetica").fontSize(9)
    .text(hsnCode, taxCol1 + 3, taxTableY + taxRowHeight + 4)
    .text(displayTaxableValue.toFixed(2), taxCol2 + 3, taxTableY + taxRowHeight + 4)
    .text(`${taxRate}%`, taxCol3 + 3, taxTableY + taxRowHeight + 4)
    .text(taxAmount.toFixed(2), taxCol4 + 3, taxTableY + taxRowHeight + 4)
    .text(taxAmount.toFixed(2), taxCol5 + 3, taxTableY + taxRowHeight + 4);

  y += taxRowHeight * 2 + 10;

  /* ---------- AMOUNT IN WORDS ---------- */
  doc.font("Helvetica").fontSize(9).text("Amount Chargeable (in words)", pageLeft, y);

  doc
    .font("Helvetica-Bold")
    .text(amountInWords(finalTotal), pageLeft, y + 12);

  y += 35;

  /* ---------- DECLARATION ---------- */
  doc.font("Helvetica-Bold").fontSize(9).text("Declaration:", pageLeft, y);
  y += 12;
  doc.font("Helvetica").fontSize(8);
  doc.text("Actual quantity delivered may vary by +/- 25 Sq. Ft. or by upto 10% for Bulk Quantities.", pageLeft, y);
  y += 10;
  doc.text("Being a natural product, 1 or 2 holes on the hides are inevitable.", pageLeft, y);
  y += 10;
  doc.text("Colour may vary by 2-3% from lot to lot.", pageLeft, y);
  y += 10;
  doc.text("Goods once sold cannot be returned under any circumstances.", pageLeft, y);
  y += 10;
  doc.text("Freight & Forwarding Charges will be invoiced at actuals.", pageLeft, y);
  y += 20;

  /* ---------- FOOTER (BANK + NOTE) ---------- */
  const footerBlockHeight = 65;

  // Left: Bank Details
  doc.font("Helvetica-Bold").fontSize(9).text("Bank Details", pageLeft + 4, y + 4);
  doc.font("Helvetica").fontSize(8).text(`Bank Name: Bank of India`, pageLeft + 4, y + 16);
  doc.text(`Account Name: Marvin Lifestyle India Pvt. Ltd.`, pageLeft + 4, y + 26);
  doc.text(`Account Number: ${company.accountNo}`, pageLeft + 4, y + 36);
  doc.text(`Branch: ${company.branch}`, pageLeft + 4, y + 46);
  doc.text(`IFSC: ${company.ifsc}`, pageLeft + 4, y + 56);

  // Right: Signature placeholder
  const rightColX = pageLeft + Math.floor(contentWidth * 0.6) + 4;
  const rightColWidth = Math.floor(contentWidth * 0.4) - 8;
  const rightColCenter = rightColX + (rightColWidth / 2);
  doc.font("Helvetica-Bold").fontSize(9).text(company.signature, rightColCenter - 40, y + 10, { align: "center", width: 80 });

  // Add company seal if available
  const sealPath = path.resolve(__dirname, `../../assets/${isWestern ? 'western-seal.png' : 'marvin-seal.png'}`);
  if (fs.existsSync(sealPath)) {
    doc.image(sealPath, rightColX + Math.floor(contentWidth * 0.4) - 60, y + 4, { width: 50, height: 50 });
  }

  // Add professional note near the bottom page border, centered.
  const noteText = "This is a computer generated Proforma Invoice and does not require any signature";
  const pageBottomLimit = doc.page.height - doc.page.margins.bottom - 12;
  const noteY = pageBottomLimit - 8;

  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(noteText, pageLeft, noteY, {
      width: contentWidth,
      align: "center"
    });

  doc.end();
};