const PDFDocument = require("pdfkit");

module.exports = function generateExactPIPdf(res, pi) {
  const doc = new PDFDocument({ size: "A4", margin: 0 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=PI-0389.pdf`);

  doc.pipe(res);

  try {
    const leftCol = 40;
    const midCol = 300;
    const width = 515;
    let currentY = 40;

    doc.rect(40, 40, 515, 750).stroke();

    doc.font("Helvetica-Bold").fontSize(14).text("MARVIN", leftCol + 5, currentY + 10);
    doc.fontSize(8).font("Helvetica").text("lifestyle", leftCol + 5, currentY + 25);
    
    doc.font("Helvetica-Bold").fontSize(12).text("Proforma Invoice", midCol + 50, currentY + 10);

    currentY += 45;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc.font("Helvetica-Bold").fontSize(9).text("Marvin Lifestyle India Pvt. Ltd.", leftCol + 5, currentY + 10);
    doc.font("Helvetica").fontSize(8);
    doc.text("Ground Floor, # 36/286, Anand Nagar,", leftCol + 5, currentY + 22);
    doc.text("Om CHSL, Jawahar Lal Nehru Road,", leftCol + 5, currentY + 32);
    doc.text("Mumbai, Mumbai Suburban, Maharashtra 400 055", leftCol + 5, currentY + 42);
    doc.text("GSTIN/UIN: 27AAGCM7754A1ZH", leftCol + 5, currentY + 52);
    doc.text("State Name: Maharashtra, Code: 27", leftCol + 5, currentY + 62);

    doc.moveTo(midCol, currentY).lineTo(midCol, currentY + 140).stroke();
    
    doc.text("Invoice No.", midCol + 5, currentY + 10);
    doc.font("Helvetica-Bold").text("MLM/PI/2526/0389", midCol + 100, currentY + 10);
    doc.moveTo(midCol, currentY + 25).lineTo(555, currentY + 25).stroke();
    
    doc.font("Helvetica").text("Dated", midCol + 5, currentY + 30);
    doc.font("Helvetica-Bold").text("12-Dec-25", midCol + 100, currentY + 30);
    doc.moveTo(midCol, currentY + 45).lineTo(555, currentY + 45).stroke();

    currentY += 80;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc.font("Helvetica").text("Consignee (Ship to)", leftCol + 5, currentY + 5);
    doc.font("Helvetica-Bold").text("Rasulbhai Adamji & Co.", leftCol + 5, currentY + 15);
    doc.font("Helvetica").text("Gala # 64/65, Ground Floor, Husseini Lakda Bazar,", leftCol + 5, currentY + 25);
    doc.text("Jahangir Boman Behram Marg, Mumbai - 400 008", leftCol + 5, currentY + 35);
    doc.text("GSTIN/UIN: 27AAFFR6079P1ZC", leftCol + 5, currentY + 45);
    doc.text("State Name: Maharashtra, Code: 27", leftCol + 5, currentY + 55);
    doc.text("Contact: 9082265159", leftCol + 5, currentY + 65);

    currentY += 80;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    const tableTop = currentY;
    const tableHeaders = ["SI No.", "Description of Goods", "HSN/SAC", "Quantity", "Rate", "per", "Disc %", "Amount"];
    const colWidths = [30, 180, 60, 60, 60, 40, 40, 45];
    let colX = leftCol;

    doc.font("Helvetica-Bold").fontSize(8);
    tableHeaders.forEach((header, i) => {
        doc.text(header, colX + 2, tableTop + 5, { width: colWidths[i], align: i > 2 ? 'right' : 'left' });
        colX += colWidths[i];
        if (i < tableHeaders.length - 1) doc.moveTo(colX, tableTop).lineTo(colX, tableTop + 300).stroke();
    });

    currentY += 20;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();

    doc.font("Helvetica").text("1", leftCol + 2, currentY + 5);
    doc.font("Helvetica-Bold").text("Ocean 1021 Black", leftCol + 32, currentY + 5);
    doc.font("Helvetica").text("41079100", leftCol + 212, currentY + 5);
    doc.text("117.75 SQF", leftCol + 272, currentY + 5, { width: 60, align: 'right' });
    doc.text("140.00", leftCol + 332, currentY + 5, { width: 60, align: 'right' });
    doc.text("SQF", leftCol + 392, currentY + 5);
    doc.text("16,485.00", leftCol + 472, currentY + 5, { width: 43, align: 'right' });

    doc.text("Output CGST @ 2.5%", leftCol + 32, currentY + 25);
    doc.text("2.50", leftCol + 332, currentY + 25, { width: 60, align: 'right' });
    doc.text("%", leftCol + 392, currentY + 25);
    doc.text("412.13", leftCol + 472, currentY + 25, { width: 43, align: 'right' });

    doc.text("Output SGST @ 2.5%", leftCol + 32, currentY + 35);
    doc.text("2.50", leftCol + 332, currentY + 35, { width: 60, align: 'right' });
    doc.text("%", leftCol + 392, currentY + 35);
    doc.text("412.13", leftCol + 472, currentY + 35, { width: 43, align: 'right' });

    doc.text("Less: Rounded Off Balance", leftCol + 32, currentY + 45);
    doc.text("(-) 0.26", leftCol + 472, currentY + 45, { width: 43, align: 'right' });

    currentY = tableTop + 300;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
    doc.font("Helvetica-Bold").text("Total", leftCol + 32, currentY + 5);
    doc.text("117.75 SQF", leftCol + 272, currentY + 5, { width: 60, align: 'right' });
    doc.text("17,309.00", leftCol + 472, currentY + 5, { width: 43, align: 'right' });

    currentY += 20;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
    doc.font("Helvetica").text("Amount Chargeable (in words)", leftCol + 5, currentY + 5);
    doc.font("Helvetica-Bold").text("INR Seventeen Thousand Three Hundred Nine Only", leftCol + 5, currentY + 15);

    currentY += 35;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
    doc.font("Helvetica-Bold").fontSize(7).text("Declaration", leftCol + 5, currentY + 5);
    doc.font("Helvetica").text("1. Actual quantity delivered may vary by +/- 25 Sq. Ft. or by upto 10% for Bulk Quantities.", leftCol + 5, currentY + 15);
    doc.text("2. Being a natural product, 1 or 2 holes on the hides are inevitable.", leftCol + 5, currentY + 25);
    doc.text("3. Colour may vary by 2-3% form lot to lot.", leftCol + 5, currentY + 35);
    doc.text("4. Goods once sold cannot be returned under any circumstances.", leftCol + 5, currentY + 45);
    doc.text("5. Freight & Forwarding Charges will be invoiced at actuals.", leftCol + 5, currentY + 55);

    currentY += 70;
    doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
    doc.font("Helvetica-Bold").text("Company's Bank Details", leftCol + 5, currentY + 5);
    doc.font("Helvetica").text("Bank Name: Bank of India OD Account", leftCol + 5, currentY + 15);
    doc.text("A/c No: 840930110000045", leftCol + 5, currentY + 25);
    doc.text("Branch & IFS Code: Richmond Town & BKID0008409", leftCol + 5, currentY + 35);

    doc.moveTo(midCol, currentY).lineTo(midCol, 790).stroke();
    doc.font("Helvetica-Bold").text("for Marvin Lifestyle India Pvt. Ltd.", midCol + 20, currentY + 5);
    doc.text("Authorised Signatory", midCol + 50, 770);

    doc.fontSize(7).font("Helvetica").text("This is a Computer Generated Invoice", 40, 795, { align: "center", width: 515 });

    doc.end();
  } catch (err) {
    doc.end();
  }
};