const PDFDocument = require("pdfkit");
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

  return `INR ${w(Math.round(num))} Only`;
}

module.exports = function generateExactPIPdf(res, pi) {

  const doc = new PDFDocument({
    size: "A4",
    margin: 40
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=PI-${pi.id}.pdf`);

  doc.pipe(res);

  const isWestern = pi.company_name === COMPANY.WESTERN;
  const company = isWestern
    ? PI_CONST.COMPANIES.WESTERN
    : PI_CONST.COMPANIES.MARVIN;

  let y = 40;

  /* ---------- HEADER ---------- */

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(isWestern ? "WESTERN COLOUR" : "MARVIN", 40, y);

  if (!isWestern) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .text("lifestyle", 40, y + 18);
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Proforma Invoice", 400, y);

  y += 40;

  /* ---------- COMPANY ---------- */

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(company.name, 40, y);

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(company.address, 40, y + 15, { width: 250 });

  doc.text(`GSTIN: ${company.gstin}`, 40, y + 40);
  doc.text(`State: ${company.state} (${company.stateCode})`, 40, y + 55);

  /* ---------- INVOICE INFO ---------- */

  doc
    .font("Helvetica")
    .fontSize(10)
    .text("Invoice No", 350, y);

  doc
    .font("Helvetica-Bold")
    .text(`${isWestern ? "WC/PI/2526/" : "MLM/PI/"}${pi.id}`, 430, y);

  doc
    .font("Helvetica")
    .text("Date", 350, y + 20);

  doc
    .font("Helvetica-Bold")
    .text(formatDate(pi.createdAt), 430, y + 20);

  y += 100;

  console.log("📄 PDF Generation - PI Addresses:", {
    pi_id: pi.id,
    billing_address: pi.billing_address,
    shipping_address: pi.shipping_address,
    address: pi.address,
  });

  /* ---------- BILLING ADDRESS ---------- */

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("BILL TO:", 40, y);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(pi.customer_name, 40, y + 18);

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(pi.billing_address || pi.address, 40, y + 35, { width: 260 });

  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`GSTIN: ${pi.gst_number || "-"}`, 40, y + 60);
  
  doc.text(`State: ${pi.state}`, 40, y + 73);
  doc.text(`Contact: ${pi.contact || "-"}`, 40, y + 86);

  /* ---------- SHIPPING ADDRESS (if different) ---------- */
  const billAddr = (pi.billing_address || pi.address || "").trim();
  const shipAddr = (pi.shipping_address || "").trim();
  
  console.log("📍 Address Comparison:", {
    billAddr: `"${billAddr}"`,
    shipAddr: `"${shipAddr}"`,
    isShipAddrEmpty: !shipAddr,
    isDifferent: shipAddr !== billAddr,
    willShowShipTo: shipAddr && shipAddr !== billAddr,
  });
  
  if (shipAddr && shipAddr !== billAddr) {
    console.log("✅ Adding SHIP TO section");
    
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("SHIP TO:", 350, y);
    
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(pi.customer_name, 350, y + 18);
    
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(shipAddr, 350, y + 35, { width: 190 });
  } else {
    console.log("❌ SHIP TO section NOT added - Condition not met");
  }

  y += 120;

  /* ---------- TABLE HEADER ---------- */

  const cols = [40, 70, 260, 320, 380, 430, 480, 520];

  doc.font("Helvetica-Bold").fontSize(9);

  doc.text("#", cols[0], y);
  doc.text("Description", cols[1], y);
  doc.text("HSN", cols[2], y);
  doc.text("Qty", cols[3], y);
  doc.text("Rate", cols[4], y);
  doc.text("Per", cols[5], y);
  doc.text("Disc", cols[6], y);
  doc.text("Amount", cols[7], y, { align: "right" });

  y += 15;

  /* ---------- ITEMS ---------- */

  let subtotal = 0;

  doc.font("Helvetica").fontSize(9);

  pi.items.forEach((item, i) => {

    const rate = item.rate;
    const qty = item.qty;
    const amount = rate * qty;

    subtotal += amount;

    doc.text(i + 1, cols[0], y);

    doc
      .font("Helvetica-Bold")
      .text(`${item.product.leather_code} ${item.product.color}`, cols[1], y);

    doc
      .font("Helvetica")
      .text(item.product.hsn_code || "4107", cols[2], y);

    doc.text(qty.toFixed(2), cols[3], y);
    doc.text(rate.toFixed(2), cols[4], y);
    doc.text("SQF", cols[5], y);
    doc.text("-", cols[6], y);

    doc.text(amount.toFixed(2), cols[7], y, {
      width: 60,
      align: "right"
    });

    y += 18;

  });

  /* ---------- TAX ---------- */

  const sameState =
    pi.state?.toLowerCase().trim() ===
    company.state?.toLowerCase().trim();

  const cgst = sameState ? subtotal * PI_CONST.CGST / 100 : 0;
  const sgst = sameState ? subtotal * PI_CONST.SGST / 100 : 0;
  const igst = sameState ? 0 : subtotal * PI_CONST.IGST / 100;

  let total = subtotal + cgst + sgst + igst;

  let transportCharge = 0;

  if (pi.transport_amount > 0) {
    transportCharge = pi.transport_amount;
    total += transportCharge;
  }

  y += 20;

  doc.font("Helvetica");

  if (sameState) {

    doc.text(`CGST ${PI_CONST.CGST}%`, 400, y);
    doc.text(cgst.toFixed(2), 520, y, { align: "right" });

    y += 15;

    doc.text(`SGST ${PI_CONST.SGST}%`, 400, y);
    doc.text(sgst.toFixed(2), 520, y, { align: "right" });

    y += 15;

  } else {

    doc.text(`IGST ${PI_CONST.IGST}%`, 400, y);
    doc.text(igst.toFixed(2), 520, y, { align: "right" });

    y += 15;

  }

  if (transportCharge > 0) {

    doc.text("Transport", 400, y);
    doc.text(transportCharge.toFixed(2), 520, y, { align: "right" });

    y += 15;

  }

  /* ---------- TOTAL ---------- */

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Total", 400, y);

  doc.text(total.toFixed(2), 520, y, {
    align: "right"
  });

  y += 35;

  /* ---------- AMOUNT WORDS ---------- */

  doc
    .font("Helvetica")
    .fontSize(9)
    .text("Amount in Words", 40, y);

  doc
    .font("Helvetica-Bold")
    .text(amountInWords(total), 40, y + 15);

  y += 70;

  /* ---------- BANK ---------- */

  doc
    .font("Helvetica-Bold")
    .text("Bank Details", 40, y);

  doc
    .font("Helvetica")
    .text(`Bank: ${company.bankName}`, 40, y + 15);

  doc.text(`Account: ${company.accountNo}`, 40, y + 30);

  doc.text(
    `Branch: ${company.branch}  |  IFSC: ${company.ifsc}`,
    40,
    y + 45
  );

  /* ---------- SIGN ---------- */

  doc
    .font("Helvetica-Bold")
    .text(company.signature, 400, y);

  doc
    .font("Helvetica")
    .fontSize(9)
    .text("Authorised Signatory", 400, y + 60);

  doc
    .fontSize(8)
    .text("This is a computer generated invoice", 0, 780, {
      align: "center"
    });

  doc.end();
};