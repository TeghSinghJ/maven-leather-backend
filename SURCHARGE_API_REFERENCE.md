# 🔌 Surcharge API Reference

## Overview
The surcharge field allows you to add a **flat adjustment amount** on top of any line item pricing. This works with both auto rates and manual rate overrides.

---

## Complete Example: Your Use Case

### Requirements:
- **Product**: 140 (Micro Cinder)
- **Qty**: 11
- **Base Price (Auto)**: ₹1600
- **Manual Override**: ₹1650
- **Additional Surcharge**: ₹50
- **Expected Final**: ₹18,200

### API Call:

```bash
curl -X POST http://localhost:3000/api/proforma-invoices/create \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": 5,
    "price_type": "DP",
    "company_name": "MARVIN",
    "items": [
      {
        "product_id": 140,
        "collection_series_id": 25,
        "qty": 11,
        "requested_qty": 11,
        "rate": 1650,
        "surcharge": 50,
        "hides": [
          {
            "hide_id": 12345,
            "hide_qty": 11
          }
        ]
      }
    ]
  }'
```

### Response:
```json
{
  "id": 123,
  "customer_id": 5,
  "status": "PENDING_APPROVAL",
  "items": [
    {
      "id": 456,
      "product_id": 140,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50,
      "lineTotal": 18200,
      "batch_info": "[...]"
    }
  ],
  "subtotal": 18200,
  "totalTax": 909.50,
  "finalTotal": 19109.50
}
```

---

## ALL API ENDPOINTS

### 1️⃣ CREATE PI with Surcharge

**Endpoint:** `POST /api/proforma-invoices/create`

**Request Body:**
```json
{
  "customer_id": 5,
  "price_type": "DP",
  "company_name": "MARVIN",
  "items": [
    {
      "product_id": 140,
      "collection_series_id": 25,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50
    }
  ]
}
```

**Field Explanations:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | Integer | ✅ | Product ID |
| `collections_series_id` | Integer | ✅ | Series for allocation |
| `qty` | Float | ✅ | Quantity ordered |
| `rate` | Float | ❌ | Manual price override (uses auto if not provided) |
| `surcharge` | Float | ❌ | Additional flat charge (default: 0) |

---

### 2️⃣ UPDATE PI Line Item with Surcharge

**Endpoint:** `POST /api/proforma-invoices/:id/revisit`

**Request Body:**
```json
{
  "items": [
    {
      "product_id": 140,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50,
      "batch_no": "BATCH-001",
      "hides": [
        {
          "hide_id": 12345,
          "hide_qty": 11
        }
      ]
    }
  ]
}
```

---

### 3️⃣ GET PI (Shows Surcharge in Response)

**Endpoint:** `GET /api/proforma-invoices/:id`

**Response:**
```json
{
  "id": 123,
  "items": [
    {
      "id": 456,
      "product_id": 140,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50,
      "batch_info": "[...]",
      "product": {
        "id": 140,
        "leather_code": "MC-001",
        "color": "Black"
      }
    }
  ],
  "subtotal": 18200
}
```

---

## Calculation Examples

### Example 1: Manual Rate + Surcharge ✅ (RECOMMENDED)
```
Input:  qty=11, rate=1650, surcharge=50
Calculation: (11 × 1650) + 50
Output: 18200
```

### Example 2: Auto Rate + Surcharge
```
Input:  qty=11, rate=(auto 1600), surcharge=50
Calculation: (11 × 1600) + 50
Output: 17650
```

### Example 3: No Surcharge
```
Input:  qty=11, rate=1650, surcharge=0
Calculation: (11 × 1650) + 0
Output: 18150
```

### Example 4: Multiple Items
```json
{
  "items": [
    {
      "product_id": 140,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50
    },
    {
      "product_id": 141,
      "qty": 5,
      "rate": 2000,
      "surcharge": 100
    }
  ]
}
```

Calculations:
- Item 1: (11 × 1650) + 50 = **18,200**
- Item 2: (5 × 2000) + 100 = **10,100**
- Subtotal: **28,300**

---

## PDF Invoice Display

When you download the PDF, it shows:

```
┌─────────────────────────────────────────────────────────────┐
│ S.No │ Product          │ HSN   │ Qty  │ Rate    │ Amount   │
├─────────────────────────────────────────────────────────────┤
│ 1    │ 140 Micro Cinder │ 41079 │ 11   │ 1650.00 │ 18200.00 │
│      │ (+Add. Charge)   │       │      │         │   +50.00 │
└─────────────────────────────────────────────────────────────┘
```

---

## Common Use Cases

### ✅ Case 1: Business Executive Says "Add ₹50"
```json
{
  "product_id": 140,
  "qty": 11,
  "rate": 1600,    // Auto price
  "surcharge": 50  // Executive's adjustment
}
// Result: 17,650
```

### ✅ Case 2: Manual Override + Extra Charge
```json
{
  "product_id": 140,
  "qty": 11,
  "rate": 1650,    // Override (instead of 1600)
  "surcharge": 50  // Additional charge
}
// Result: 18,200
```

### ✅ Case 3: Bulk Discount (Negative Surcharge)
```json
{
  "product_id": 140,
  "qty": 100,
  "rate": 1600,
  "surcharge": -1000  // Bulk discount
}
// Result: 159,000
```

### ✅ Case 4: Multi-Item Order
```json
{
  "items": [
    {
      "product_id": 140,
      "qty": 11,
      "rate": 1650,
      "surcharge": 50
    },
    {
      "product_id": 141,
      "qty": 5,
      "rate": 2000,
      "surcharge": 0
    },
    {
      "product_id": 142,
      "qty": 8,
      "rate": 1800,
      "surcharge": 100
    }
  ]
}
// Item 1: 18,200
// Item 2: 10,000
// Item 3: 14,500
// Total: 42,700
```

---

## Error Handling

### Surcharge Must Be Numeric
```bash
❌ surcharge: "50 rs"     # Invalid string
✅ surcharge: 50          # Correct number

❌ surcharge: "abc"       # Invalid
✅ surcharge: -50         # Valid (can be negative)
```

### Missing Fields
| Scenario | Result |
|----------|--------|
| `rate` missing | Uses auto collection price |
| `surcharge` missing | Defaults to 0 |
| `qty` missing | ERROR - Required |
| `product_id` missing | ERROR - Required |

---

## Database Query

### View Items with Surcharges
```sql
SELECT 
  id,
  pi_id,
  product_id,
  qty,
  rate,
  surcharge,
  (qty * rate + surcharge) as line_total
FROM pi_items
WHERE surcharge > 0;
```

---

## Frontend Integration

### React Hook
```javascript
function usePISurcharge() {
  const [surcharge, setSurcharge] = useState(0);
  const [rate, setRate] = useState(0);
  const [qty, setQty] = useState(0);

  const lineTotal = (qty * rate) + surcharge;

  return { surcharge, setSurcharge, lineTotal };
}
```

### Vue Component
```vue
<template>
  <div>
    <input v-model.number="rate" placeholder="Rate">
    <input v-model.number="surcharge" placeholder="Surcharge">
    <p>Total: {{ (qty * rate) + surcharge }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      qty: 11,
      rate: 1650,
      surcharge: 50
    };
  }
};
</script>
```

---

## ✅ Summary

You now have **3 pricing options**:

1. **Auto Price** - From collection prices
2. **Manual Price Override** - Your custom rate
3. **Surcharge** - Additional flat amount on top

**Combine them all for complete control!** 🎉
