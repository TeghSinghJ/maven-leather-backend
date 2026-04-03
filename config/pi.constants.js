module.exports = {
  COMPANIES: {
    MARVIN: {
      name: "Marvin Lifestyle India Pvt. Ltd. (Bangalore) 26-27",
      address: "#45, Unit # 101,201,301, Sriven Rag Landmark, Wilson Garden, Near Brand Factory, Bangaluru-560027",
      gstin: "29AAGCM7754A1ZD",
      state: "Karnataka",
      stateCode: "29",
      email: "accounts@marvinlifestyle.com",
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
    name: "Marvin Lifestyle India Pvt. Ltd. (Bangalore) 26-27",
    address: "#45, Unit # 101,201,301, Sriven Rag Landmark, Wilson Garden, Near Brand Factory, Bangaluru-560027",
    gstin: "29AAGCM7754A1ZD",
    state: "Karnataka",
    stateCode: "29",
  },
  DEFAULT_RATE: 250,
  // GST rates: local (intra-state) split into CGST+SGST, inter-state uses IGST
  CGST: 2.5,
  SGST: 2.5,
  IGST: 5,
};
