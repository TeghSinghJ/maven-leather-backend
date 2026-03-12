module.exports = {
  COMPANIES: {
    MARVIN: {
      name: "Marvin Leather Experience Centre",
      address: "47, Wilson Garden, Hosur Main Road, Bengaluru, Karnataka 560027, India",
      gstin: "29ABCDE1234F1Z5",
      state: "Karnataka",
      stateCode: "560027",
      email: "info@marvinleather.com", // Update with actual email
      bankName: "Bank of India OD Account",
      accountNo: "840930110000045",
      ifsc: "BKID0008409",
      branch: "Richmond Town",
      signature: "for Marvin Lifestyle India Pvt. Ltd.",
    },
    WESTERN: {
      name: "Western Colour",
      address: "45, Unit # 501, 4th Floor, Wilson Garden, Hosur Main Road, Bengaluru - 560 027",
      gstin: "29AALEPR1689K1ZD",
      state: "Karnataka",
      stateCode: "29",
      email: "info@westerncolour.com",
      bankName: "State Bank of India",
      accountNo: "40688922582",
      ifsc: "SBIN0060133",
      branch: "Misson Road Bangalore",
      signature: "Western Colour Private Limited",
    },
  },
  // Legacy support - default to MARVIN
  COMPANY: {
    name: "Marvin Leather Experience Centre",
    address: "47, Wilson Garden, Hosur Main Road, Bengaluru, Karnataka 560027, India",
    gstin: "29ABCDE1234F1Z5",
    state: "Karnataka",
    stateCode: "560027",
  },
  DEFAULT_RATE: 250,
  // GST rates: local (intra-state) split into CGST+SGST, inter-state uses IGST
  CGST: 2.5,
  SGST: 2.5,
  IGST: 5,
};
