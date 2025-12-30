const PDFDocument = require("pdfkit");
const PI_CONST = require("../../config/pi.constants");

module.exports = function generateExactPIPdf(res, pi) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=PI-${pi.id}.pdf`
  );

  doc.pipe(res);

  // If client closes tab
  res.on("close", () => {
    doc.end();
  });

  try {
    /* ---------------- HEADER ---------------- */
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("PROFORMA INVOICE", 0, 50, { align: "right" });

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(`PI No: PI-${pi.id}`, { align: "right" })
      .text(`Date: ${new Date().toLocaleDateString("en-IN")}`, {
        align: "right",
      });

    doc.moveDown(2);

    /* ---------------- SELLER ---------------- */
    doc.font("Helvetica-Bold").text("Seller:");
    doc.font("Helvetica");
    doc.text(PI_CONST.COMPANY.name);
    doc.text(PI_CONST.COMPANY.address);
    doc.text(`GSTIN: ${PI_CONST.COMPANY.gstin}`);

    /* ---------------- BUYER ---------------- */
    doc.moveUp(4);
    doc.font("Helvetica-Bold").text("Buyer:", 320);
    doc.font("Helvetica");
    doc.text(pi.customer_name, 320);
    doc.text(pi.address, 320);
    doc.text(`GSTIN: ${pi.gst_number || "-"}`, 320);
    doc.text(`State: ${pi.state}`, 320);

    doc.moveDown(2);

    /* ---------------- TABLE ---------------- */
    const tableTop = doc.y;
    const col = { sn: 40, desc: 80, qty: 300, rate: 360, amount: 440 };

    doc.font("Helvetica-Bold");
    doc.rect(40, tableTop, 520, 25).stroke();
    doc.text("S.No", col.sn, tableTop + 7);
    doc.text("Description", col.desc, tableTop + 7);
    doc.text("Qty", col.qty, tableTop + 7);
    doc.text("Rate", col.rate, tableTop + 7);
    doc.text("Amount", col.amount, tableTop + 7);

    let y = tableTop + 25;
    let subtotal = 0;

    doc.font("Helvetica");

    pi.items.forEach((item, i) => {
      const rate = PI_CONST.DEFAULT_RATE;
      const amount = rate * item.qty;
      subtotal += amount;

      doc.rect(40, y, 520, 25).stroke();
      doc.text(i + 1, col.sn, y + 7);
      doc.text(
        `${item.product.leather_code} - ${item.product.color}`,
        col.desc,
        y + 7,
        { width: 210 }
      );
      doc.text(item.qty, col.qty, y + 7);
      doc.text(rate.toFixed(2), col.rate, y + 7);
      doc.text(amount.toFixed(2), col.amount, y + 7);

      y += 25;
    });

    /* ---------------- GST ---------------- */
    const sameState = pi.state === PI_CONST.COMPANY.state;
    const cgst = sameState ? (subtotal * PI_CONST.CGST) / 100 : 0;
    const sgst = sameState ? (subtotal * PI_CONST.SGST) / 100 : 0;
    const igst = sameState ? 0 : (subtotal * PI_CONST.IGST) / 100;
    const grandTotal = subtotal + cgst + sgst + igst;

    y += 10;
    const totalX = 340;

    doc.text("Subtotal:", totalX, y);
    doc.text(subtotal.toFixed(2), 480, y);

    if (cgst) {
      y += 18;
      doc.text(`CGST @ ${PI_CONST.CGST}%:`, totalX, y);
      doc.text(cgst.toFixed(2), 480, y);

      y += 18;
      doc.text(`SGST @ ${PI_CONST.SGST}%:`, totalX, y);
      doc.text(sgst.toFixed(2), 480, y);
    }

    if (igst) {
      y += 18;
      doc.text(`IGST @ ${PI_CONST.IGST}%:`, totalX, y);
      doc.text(igst.toFixed(2), 480, y);
    }

    y += 22;
    doc.font("Helvetica-Bold");
    doc.text("Grand Total:", totalX, y);
    doc.text(grandTotal.toFixed(2), 480, y);

    /* ---------------- FOOTER ---------------- */
    doc.moveDown(4);
    doc.fontSize(9);
    doc.text("This is a system generated Proforma Invoice.");
    doc.text("Validity: 7 days from invoice date.");

    doc.end();
  } catch (err) {
    console.error("PDF generation error:", err);
    doc.end();
  }
};
