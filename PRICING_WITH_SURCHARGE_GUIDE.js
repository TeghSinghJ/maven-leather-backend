/**
 * PRICING STRUCTURE WITH SURCHARGE
 * 
 * Example: 140 (Micro Cinder) - 11 units
 * 
 * SCENARIO 1: Auto Mode (No Manual Override, No Surcharge)
 * ============================================================
 * DP Price (from collection_prices): 1600
 * Qty: 11
 * Rate: 1600 (auto)
 * Surcharge: 0
 * Line Total: (11 × 1600) + 0 = 17,600
 * 
 * 
 * SCENARIO 2: Manual Price Override Only
 * ============================================================
 * DP Price (from collection_prices): 1600
 * Qty: 11
 * Rate: 1650 (MANUAL OVERRIDE)
 * Surcharge: 0
 * Line Total: (11 × 1650) + 0 = 18,150
 * 
 * 
 * SCENARIO 3: Manual Price + Surcharge (What You Need!)
 * ============================================================
 * DP Price (from collection_prices): 1600
 * Qty: 11
 * Rate: 1650 (MANUAL OVERRIDE)
 * Surcharge: 50 (ADDITIONAL ADJUSTMENT)
 * Line Total: (11 × 1650) + 50 = 18,200 ✅
 * 
 * 
 * SCENARIO 4: Surcharge Only (No Manual Override)
 * ============================================================
 * DP Price (from collection_prices): 1600
 * Qty: 11
 * Rate: 1600 (auto)
 * Surcharge: 50 (ADDITIONAL ADJUSTMENT)
 * Line Total: (11 × 1600) + 50 = 17,650 ✅
 */

// ==============================================================================
// HOW TO USE: CREATE OR UPDATE PI WITH MANUAL RATE + SURCHARGE
// ==============================================================================

// API: POST /api/proforma-invoices/create
const createPIWithSurcharge = {
  customer_id: 5,
  price_type: "DP", // or "RRP", "ARCH"
  items: [
    {
      product_id: 140,
      collection_series_id: 25,
      qty: 11,
      
      // OPTION 1: Use auto rate (from collection prices)
      // rate: undefined, // Will use DP/RRP/ARCH price automatically
      
      // OPTION 2: Override with manual rate
      rate: 1650, // Manual override instead of auto 1600
      
      // OPTIONAL: Add surcharge on top
      surcharge: 50, // +50 rs flat on top of the line total
    }
  ]
};

// API: POST /api/proforma-invoices/:id/revisit
const revisitPIWithSurcharge = {
  items: [
    {
      product_id: 140,
      qty: 11,
      rate: 1650, // Manual rate
      surcharge: 50, // Additional surcharge
      batch_no: "BATCH-123",
      hides: [
        {
          hide_id: 12345,
          hide_qty: 11
        }
      ]
    }
  ]
};

// ==============================================================================
// CALCULATION LOGIC
// ==============================================================================

function calculateLineTotal(qty, rate, surcharge = 0) {
  const baseTotal = qty * rate;
  const lineTotal = baseTotal + surcharge;
  
  return {
    qty,
    rate,
    baseTotal,
    surcharge,
    lineTotal
  };
}

// Example:
const result = calculateLineTotal(11, 1650, 50);
console.log(result);
// Output:
// {
//   qty: 11,
//   rate: 1650,
//   baseTotal: 18150,
//   surcharge: 50,
//   lineTotal: 18200
// }

// ==============================================================================
// ADVANCED: PERCENTAGE-BASED SURCHARGE (Optional)
// ==============================================================================

// If you also want percentage-based adjustments in future:
function calculateWithPercentageSurcharge(qty, rate, surchargePercent = 0) {
  const baseTotal = qty * rate;
  const surchargeAmount = (baseTotal * surchargePercent) / 100;
  const lineTotal = baseTotal + surchargeAmount;
  
  return {
    baseTotal,
    surchargePercent,
    surchargeAmount,
    lineTotal
  };
}

// Example: Add 3% surcharge
const result2 = calculateWithPercentageSurcharge(11, 1650, 3);
console.log(result2);
// Output:
// {
//   baseTotal: 18150,
//   surchargePercent: 3,
//   surchargeAmount: 544.5,
//   lineTotal: 18694.5
// }
