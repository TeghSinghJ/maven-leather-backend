const PDFDocument = require("pdfkit");
const PI_CONST = require("../../config/pi.constants");

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function amountInWords(num) {
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  const w = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000)
      return (
        a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + w(n % 100) : "")
      );
    if (n < 100000)
      return (
        w(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + w(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        w(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + w(n % 100000) : "")
      );
    return (
      w(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + w(n % 10000000) : "")
    );
  };

  return `INR ${w(Math.round(num))} Only`;
}

module.exports = function generateExactPIPdf(res, pi) {
  const doc = new PDFDocument({ size: "A4", margin: 0 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=PI-${pi.id}.pdf`);

  doc.pipe(res);
  res.on("close", () => doc.end());

  try {
    const leftCol = 40;
    const midCol = 300;
    let currentY = 40;

    doc.rect(40, 40, 515, 750).stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("MARVIN", leftCol + 5, currentY + 10);
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("lifestyle", leftCol + 5, currentY + 25);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Proforma Invoice", midCol + 50, currentY + 10);

    currentY += 45;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(PI_CONST.COMPANY.name, leftCol + 5, currentY + 10, {
        width: 250,
        align: "left",
      });

    doc
      .font("Helvetica")
      .fontSize(8)
      .text(PI_CONST.COMPANY.address, leftCol + 5, currentY + 22, {
        width: 250,
        align: "left",
      });

    doc.text(
      `GSTIN/UIN: ${PI_CONST.COMPANY.gstin}`,
      leftCol + 5,
      currentY + 42,
      { width: 250, align: "left" },
    );

    doc.text(
      `State Name: ${PI_CONST.COMPANY.state}, Code: ${PI_CONST.COMPANY.stateCode}`,
      leftCol + 5,
      currentY + 52,
      { width: 250, align: "left" },
    );

    doc
      .moveTo(midCol, currentY)
      .lineTo(midCol, currentY + 140)
      .stroke();

    doc.font("Helvetica").text("Invoice No.", midCol + 5, currentY + 10);
    doc
      .font("Helvetica-Bold")
      .text(`MLM/PI/${pi.id}`, midCol + 100, currentY + 10);
    doc
      .moveTo(midCol, currentY + 25)
      .lineTo(555, currentY + 25)
      .stroke();

    doc.font("Helvetica").text("Dated", midCol + 5, currentY + 30);
    doc
      .font("Helvetica-Bold")
      .text(formatDate(pi.createdAt), midCol + 100, currentY + 30);

    currentY += 80;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc
      .font("Helvetica")
      .text("Consignee (Ship to)", leftCol + 5, currentY + 5);
    doc
      .font("Helvetica-Bold")
      .text(pi.customer_name, leftCol + 5, currentY + 15);
    doc.font("Helvetica").text(pi.address, leftCol + 5, currentY + 25);
    doc.text(`GSTIN/UIN: ${pi.gst_number || "-"}`, leftCol + 5, currentY + 45);
    doc.text(
      `State Name: ${pi.state}, Code: ${pi.pin_code}`,
      leftCol + 5,
      currentY + 55,
    );
    doc.text(`Contact: ${pi.contact || "-"}`, leftCol + 5, currentY + 65);

    currentY += 80;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    const tableTop = currentY;
    const colWidths = [30, 180, 60, 60, 60, 40, 40, 45];
    const headers = [
      "SI No.",
      "Description of Goods",
      "HSN/SAC",
      "Quantity",
      "Rate",
      "per",
      "Disc %",
      "Amount",
    ];
    let colX = leftCol;

    doc.font("Helvetica-Bold").fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, colX + 2, tableTop + 5, {
        width: colWidths[i],
        align: i >= 3 ? "right" : "left",
      });
      colX += colWidths[i];
      if (i < headers.length - 1)
        doc
          .moveTo(colX, tableTop)
          .lineTo(colX, tableTop + 300)
          .stroke();
    });

    currentY += 20;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    let subtotal = 0;
    doc.font("Helvetica").fontSize(8);

    pi.items.forEach((item, i) => {
      const rate = item.rate;
      const qty = item.qty;
      const amount = rate * qty;
      subtotal += amount;

      doc.text(i + 1, leftCol + 2, currentY + 5);
      doc
        .font("Helvetica-Bold")
        .text(
          `${item.product.leather_code} ${item.product.color}`,
          leftCol + 32,
          currentY + 5,
        );
      doc
        .font("Helvetica")
        .text(item.product.hsn || "4107", leftCol + 212, currentY + 5);
      doc.text(qty.toFixed(2), leftCol + 272, currentY + 5, {
        width: 60,
        align: "right",
      });
      doc.text(rate.toFixed(2), leftCol + 332, currentY + 5, {
        width: 60,
        align: "right",
      });
      doc.text("SQF", leftCol + 392, currentY + 5, {
        width: 40,
        align: "right",
      });
      doc.text(amount.toFixed(2), leftCol + 472, currentY + 5, {
        width: 43,
        align: "right",
      });

      currentY += 20;
    });

    const sameState =
      pi.state?.trim().toLowerCase() ===
      PI_CONST.COMPANY.state.trim().toLowerCase();

    const cgst = sameState ? (subtotal * PI_CONST.CGST) / 100 : 0;
    const sgst = sameState ? (subtotal * PI_CONST.SGST) / 100 : 0;
    const igst = sameState ? 0 : (subtotal * PI_CONST.IGST) / 100;
    let grandTotal = subtotal + cgst + sgst + igst;
    let transportCharge = 0;
    if (pi.transport_payment_status === "TO_BE_PAID" && pi.transport_amount) {
      transportCharge = pi.transport_amount;
      grandTotal += transportCharge;
    }

    if (sameState) {
      doc.text(`Output CGST @ ${PI_CONST.CGST}%`, leftCol + 32, currentY + 5);
      doc.text(cgst.toFixed(2), leftCol + 472, currentY + 5, {
        width: 43,
        align: "right",
      });
      currentY += 12;

      doc.text(`Output SGST @ ${PI_CONST.SGST}%`, leftCol + 32, currentY + 5);
      doc.text(sgst.toFixed(2), leftCol + 472, currentY + 5, {
        width: 43,
        align: "right",
      });
      currentY += 12;
    } else {
      doc.text(`Output IGST @ ${PI_CONST.IGST}%`, leftCol + 32, currentY + 5);
      doc.text(igst.toFixed(2), leftCol + 472, currentY + 5, {
        width: 43,
        align: "right",
      });
      currentY += 12;
    }

    currentY = tableTop + 300;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
    if (
      pi.transport_payment_status === "TO_BE_PAID" &&
      pi.transport_amount > 0
    ) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .text("Transport Charges", leftCol + 32, currentY + 5);

      doc.text(pi.transport_amount.toFixed(2), leftCol + 472, currentY + 5, {
        width: 43,
        align: "right",
      });

      currentY += 12;
    }
    if (pi.transport_payment_status === "PAID") {
      doc
        .font("Helvetica-Bold")
        .fillColor("green")
        .text("TRANSPORT PAID", leftCol + 350, tableTop + 10, { rotate: 0 });
      doc.fillColor("black"); // reset color
    }

    doc.font("Helvetica-Bold").text("Total", leftCol + 32, currentY + 6);
    doc.text(grandTotal.toFixed(2), leftCol + 472, currentY + 6, {
      width: 43,
      align: "right",
    });

    currentY += 28;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Amount Chargeable (in words)", leftCol + 5, currentY + 8);
    const wordsY = currentY + 22;
    doc
      .font("Helvetica-Bold")
      .text(amountInWords(grandTotal), leftCol + 5, wordsY, { width: 500 });

    currentY =
      wordsY +
      doc.heightOfString(amountInWords(grandTotal), { width: 500 }) +
      12;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .text("Declaration", leftCol + 5, currentY + 6);
    doc.font("Helvetica").fontSize(7);
    doc.text(
      "1. Actual quantity delivered may vary by +/- 25 Sq. Ft. or by upto 10% for Bulk Quantities.",
      leftCol + 5,
      currentY + 16,
    );
    doc.text(
      "2. Being a natural product, 1 or 2 holes on the hides are inevitable.",
      leftCol + 5,
      currentY + 26,
    );
    doc.text(
      "3. Colour may vary by 2-3% form lot to lot.",
      leftCol + 5,
      currentY + 36,
    );
    doc.text(
      "4. Goods once sold cannot be returned under any circumstances.",
      leftCol + 5,
      currentY + 46,
    );
    doc.text(
      "5. Freight & Forwarding Charges will be invoiced at actuals.",
      leftCol + 5,
      currentY + 56,
    );

    currentY += 72;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc
      .font("Helvetica-Bold")
      .text("Company's Bank Details", leftCol + 5, currentY + 6);
    doc
      .font("Helvetica")
      .text("Bank Name: Bank of India OD Account", leftCol + 5, currentY + 18);
    doc.text("A/c No: 840930110000045", leftCol + 5, currentY + 28);
    doc.text(
      "Branch & IFS Code: Richmond Town & BKID0008409",
      leftCol + 5,
      currentY + 38,
    );

    doc.moveTo(midCol, currentY).lineTo(midCol, 790).stroke();
    doc
      .font("Helvetica-Bold")
      .text("for Marvin Lifestyle India Pvt. Ltd.", midCol + 20, currentY + 6);
    doc.text("Authorised Signatory", midCol + 50, 770);

    doc
      .fontSize(7)
      .font("Helvetica")
      .text("This is a Computer Generated Invoice", 40, 795, {
        align: "center",
        width: 515,
      });

    doc.end();
  } catch (err) {
    console.error(err);
    doc.end();
  }
};
