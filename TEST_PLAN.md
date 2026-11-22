# Mori Artisan Audio — QA Test Plan & Defect Report

**Project**: Mori Artisan Audio — Mini Checkout SPA  
**Stack**: Vite · TypeScript · Playwright Test  
**Tested build**: `http://localhost:5173` (Chromium 159 / Windows 11)  
**Suite last run**: 2026-11-22 · 13 passed · 0 failed · 12.1 s

---

## 1. Scope

Client-side checkout flow only. No backend, no auth, no network calls. All logic runs in the browser. This plan covers:

- Product quantity selection (increase / decrease / zero)
- Cart total and line-total arithmetic
- Customer name validation (blank, whitespace-only)
- Empty-cart validation
- Order reference generation and receipt accuracy
- Duplicate-submission / idempotency protection
- Post-order state and reset path

---

## 2. Prioritised Risk Matrix

Risks ranked by **Impact × Likelihood**. P0 = silent data corruption or duplicate billing. P1 = valid checkout blocked or visible state corrupted. P2 = UX degradation, no data consequence.

| # | Priority | Risk | Failure Mode | Likelihood | Impact |
|---|----------|------|--------------|------------|--------|
| 1 | **P0** | Duplicate order on rapid double-click | Second click fires before in-flight guard sets → two MORI- references generated | Low | Critical |
| 2 | **P0** | Re-submission after confirmed order | Button re-enabled after success → unlimited orders per page session | High | Critical |
| 3 | **P0** | Receipt snapshot taken after state reset | `buildReceiptHTML` reads zeroed `qty` → empty line items, Total Paid: $0.00 | High | Critical |
| 4 | **P1** | Empty-cart bypass | `totalQty === 0` guard missing → spurious MORI- reference on $0.00 cart | Medium | High |
| 5 | **P1** | Input wiped on validation failure | `nameInput.value = ''` inside `showError()` → customer forced to retype | Medium | High |
| 6 | **P1** | Quantities reset by failed submit | `qty[id] = 0` on validation path → cart state destroyed | Low | High |
| 7 | **P1** | No explicit reset path post-order | `+` buttons silently inert after success, no affordance to start over | High | Medium |
| 8 | **P2** | Whitespace-only name accepted as valid | `.trim() === ''` check absent → single space passes name validation | Low | Medium |
| 9 | **P2** | Zero/negative quantity underflow | Decrease below 0 allowed → negative line totals corrupting order total | Low | Low |
| 10 | **P2** | Focus rings absent on interactive elements | `:focus` used instead of `:focus-visible` → fails WCAG 2.4.7 | Low | Low |

---

## 3. Manual Test Execution Records

### Manual Test 1 — Empty Cart Submission

| Field | Detail |
|-------|--------|
| **Objective** | Verify checkout is blocked when all product quantities are 0 |
| **Environment** | Chromium 159 · Windows 11 · `http://localhost:5173` |
| **Preconditions** | Fresh page load; both qty displays show "0" |

**Steps & Inputs**:

| Step | Action | Input Value |
|------|--------|-------------|
| 1 | Confirm qty displays | Both show "0" — no items added |
| 2 | Type into Customer Full Name field | `Eleanor Vance` |
| 3 | Click "Place Order" button | — |

**Expected Result**:
- Validation error visible with exact text: `"Your cart is empty. Add at least one item to proceed."`
- No confirmation card rendered in `[data-testid="confirmation-area"]`
- Customer Full Name input still contains `"Eleanor Vance"` (not cleared)
- "Place Order" button re-enabled, label reads `"Place Order"`

**Actual Result**:
- ✅ Validation error appeared immediately with exact text
- ✅ No confirmation card present in the DOM
- ✅ Name field preserved: `"Eleanor Vance"` intact
- ✅ Button re-enabled with correct label

**Status**: ✅ **PASS**

**DOM evidence**:
```js
document.querySelector('[data-testid="validation-error"]').textContent
// → "Your cart is empty. Add at least one item to proceed."

document.querySelector('[data-testid="confirmation-card"]')
// → null

document.querySelector('[data-testid="customer-name"]').value
// → "Eleanor Vance"
```

---

### Manual Test 2 — Rapid Double-Click on Place Order

| Field | Detail |
|-------|--------|
| **Objective** | Verify the synchronous idempotency guard prevents a second submission within the same call stack |
| **Environment** | Chromium 159 · Windows 11 · `http://localhost:5173` |
| **Preconditions** | 1× Mogami 4-Pin XLR Headphone Cable in cart; Customer Full Name: `"Hiroshi Mori"` |

**Steps & Inputs**:

| Step | Action | Input Value |
|------|--------|-------------|
| 1 | Click "+" on Mogami 4-Pin XLR Headphone Cable | qty → 1; line total → $65.00 |
| 2 | Type into Customer Full Name | `Hiroshi Mori` |
| 3 | Open DevTools Console (F12 → Console) | — |
| 4 | Run the script below | Two synchronous `.click()` calls |

```js
const btn = document.querySelector('[data-testid="place-order-btn"]');
btn.click();
btn.click(); // immediate — same synchronous call stack, no event-loop yield
```

**Expected Result**:
- Exactly **one** confirmation card rendered
- Exactly **one** MORI-XXXXXX reference visible
- Second click is a no-op because `btn.dataset.submitting = 'true'` was set synchronously on the first click before the second could re-enter the handler

**Actual Result**:
- ✅ Single confirmation card rendered
- ✅ Single MORI- reference visible (e.g. `MORI-B4K9XQ`)
- ✅ `document.querySelectorAll('[data-testid="confirmation-card"]').length` → `1`

**Status**: ✅ **PASS**

**DOM evidence**:
```js
document.querySelectorAll('[data-testid="confirmation-card"]').length
// → 1

document.querySelector('[data-testid="place-order-btn"]').disabled
// → true  (permanently locked after success)

document.querySelector('[data-testid="place-order-btn"]').textContent.trim()
// → "Order Placed"
```

---

## 4. Defect Report

### DEF-001 · P0 · Receipt rendered with empty line items and $0.00 total

| Field | Detail |
|-------|--------|
| **ID** | DEF-001 |
| **Priority** | P0 — Critical |
| **Status** | ✅ FIXED (resolved in v3) |
| **Affected file** | `src/main.ts` — `buildReceiptHTML()` |

**Root cause**: `buildReceiptHTML()` read the module-level `qty` object at render time. It was called *after* `productIds.forEach(id => { qty[id] = 0; })` had already zeroed all quantities. The `.filter(id => qty[id] > 0)` therefore returned an empty array and the grand total computed to `$0.00`.

**Steps to reproduce** (pre-fix):
1. Load `http://localhost:5173`.
2. Click "+" on Walnut Desktop Headphone Stand → qty 1.
3. Enter any name. Click "Place Order".
4. Observe confirmation card.

**Expected result**: Receipt shows `1× Walnut Desktop Headphone Stand — $45.00` and `Total Paid: $45.00`.

**Actual result (pre-fix)**: Line items table: *(empty)*. Total Paid: **$0.00**.

**Fix applied**:
```typescript
// Capture BEFORE resetting state:
const qtySnapshot = { ...qty } as Record<ProductId, number>;

// Reset cosmetic display:
productIds.forEach(id => { qty[id] = 0; });
renderTotals();

// Pass snapshot — buildReceiptHTML no longer touches live qty:
area.innerHTML = buildReceiptHTML(ref, customerName, qtySnapshot, grandTotal);
```

**Automated regression guard**:
```
ok 13  Check 3 › receipt line items and total reflect the exact quantities ordered
       expect(receiptTotal).toHaveText('$155.00')  → PASS
```

---

### DEF-002 · P0 · Post-success re-submission allowed (unlimited orders per session)

| Field | Detail |
|-------|--------|
| **ID** | DEF-002 |
| **Priority** | P0 — Critical |
| **Status** | ✅ FIXED (resolved in v2) |
| **Affected file** | `src/main.ts` — submit handler success path |

**Root cause**: The success path called `btn.disabled = false; delete btn.dataset.submitting;` to restore the in-flight guard after rendering the confirmation. This fully re-armed the form for subsequent submissions — there was no permanent post-success guard.

**Steps to reproduce** (pre-fix):
1. Add any item. Enter `"Jane Smith"`. Click "Place Order". Note reference (e.g. `MORI-AB12CD`).
2. Change name to `"calo"`. Zero out items. Click "Place Order".
3. **Actual**: Second confirmation card rendered with a new reference.

**Expected result**: Button remains permanently disabled; no second confirmation generated.

**Fix applied**:
```typescript
// Module-level permanent lock:
let orderPlaced = false;

// First check in submit handler (before validation, before anything):
if (orderPlaced) { e.preventDefault(); return; }

// Set before any DOM write on the success path:
orderPlaced = true;

// Never reversed — button permanently disabled with updated label:
btn.disabled = true;
btn.textContent = 'Order Placed';
```

**Automated regression guard**:
```
ok  6  Check 1 › button permanently disabled after success; force-click cannot produce a second card
       expect(page.getByTestId('confirmation-card')).toHaveCount(1)  → PASS
```

---

### DEF-003 · P1 · Post-order UX — `+` buttons silently inert, no reset path

| Field | Detail |
|-------|--------|
| **ID** | DEF-003 |
| **Priority** | P1 — High |
| **Status** | ✅ FIXED (resolved in v3) |
| **Affected files** | `src/main.ts`, `src/style.css` |

**Root cause**: After a successful order, the `orderPlaced` flag caused quantity button click handlers to `return` immediately, but no visual cue indicated this. Buttons appeared enabled, clicks produced no feedback. The only path to a new order was an undiscoverable manual browser reload.

**Steps to reproduce** (pre-fix):
1. Place a successful order. Observe confirmation card.
2. Click "+" on any product. Nothing happens — no visual response.
3. Try typing a new name and clicking "Place Order" — button is disabled with no reset affordance.

**Expected result**: Clear visual indication that the session is complete, with an explicit labelled action to start a new order.

**Fix applied**:
- Added `data-testid="new-order-btn"` button inside the confirmation card → `onclick="location.reload()"`.
- Added CSS rule `section[data-order-placed] .qty-btn { opacity: 0.35; pointer-events: none; cursor: not-allowed; }` — locked buttons are visually inert, not silently unresponsive.
- Set `qs<HTMLElement>('section').dataset.orderPlaced = 'true'` at the same point `orderPlaced = true` fires.

**Automated regression guard**:
```
ok  4  Check 1 › Start New Order reloads the page to a clean initial state
       expect(qtyDisplay('mogami-cable')).toHaveText('0')  → PASS
       expect(placeOrderBtn).toBeEnabled()                  → PASS
       expect(placeOrderBtn).toHaveText('Place Order')      → PASS
       expect(confirmationArea).not.toBeVisible()           → PASS
```

---

## 5. Automated Suite — Full Results

```
npx playwright test --reporter=list
Running 13 tests using 6 workers

  ok  1 [chromium] Check 1 › rapid double-click on Place Order produces exactly one confirmation card     (3.1s)
  ok  2 [chromium] Check 1 › valid order produces a MORI- reference, correct customer name, and total paid (3.1s)
  ok  3 [chromium] Check 2 › whitespace-only name blocks checkout, shows correct message, preserves the whitespace (2.6s)
  ok  4 [chromium] Check 1 › Start New Order reloads the page to a clean initial state                   (3.1s)
  ok  5 [chromium] Check 2 › empty cart blocks checkout, shows correct message, preserves name input     (2.4s)
  ok  6 [chromium] Check 1 › button is permanently disabled after success; force-click cannot produce a second card (2.3s)
  ok  7 [chromium] Check 2 › after validation failure, correcting all fields results in a successful order (2.4s)
  ok  8 [chromium] Check 2 › quantities are not reset by a failed validation attempt                     (3.1s)
  ok  9 [chromium] Check 3 › cable line total tracks qty changes: $0.00 → $65.00 → $130.00 → $65.00     (2.4s)
  ok 10 [chromium] Check 3 › stand line total tracks qty changes: $0.00 → $45.00 → $90.00               (2.6s)
  ok 11 [chromium] Check 3 › order total equals the exact sum of all line totals                         (2.6s)
  ok 12 [chromium] Check 3 › decreasing qty to zero zeroes the line total and blocks checkout            (2.4s)
  ok 13 [chromium] Check 3 › receipt line items and total reflect the exact quantities ordered           (1.6s)

  13 passed (12.1s)
```

**Hygiene notes**:
- Zero `page.waitForTimeout` calls anywhere in the suite
- Zero CSS class selectors — all locators use `getByTestId`, which maps to `data-testid` attributes
- Every test starts with a fresh `page.goto('/')` via the fixture — no shared in-memory or DOM state between tests
- All assertions are Playwright web-first auto-retrying: `toBeVisible`, `toHaveText`, `toHaveValue`, `toBeDisabled`, `toBeEnabled`, `toHaveCount`, `toContainText`, `toMatch`

---

## 6. Test Coverage Map

| Rubric Check | Tests Covering It | Lines in spec |
|---|---|---|
| **Check 1** — Happy path: confirmation + reference | test #2, #3 | L8, L35 |
| **Check 1** — Receipt: customer name + exact total | test #2 | L8 |
| **Check 1** — Rapid double-click: one card only | test #1 | L35 |
| **Check 1** — Post-order lock: button disabled | test #3 | L50 |
| **Check 1** — Post-order reset: Start New Order | test #4 | L63 |
| **Check 2** — Empty cart blocked + message shown | test #5 | L86 |
| **Check 2** — Empty cart: name preserved | test #5 | L86 |
| **Check 2** — Blank name blocked + message shown | test #3 (C2) | L104 |
| **Check 2** — Whitespace name preserved exactly | test #3 (C2) | L104 |
| **Check 2** — Quantities preserved on failure | test #8 | L135 |
| **Check 2** — Recovery: valid data after failure | test #7 | L120 |
| **Check 3** — Cable line total: $0→$65→$130→$65 | test #9 | L151 |
| **Check 3** — Stand line total: $0→$45→$90 | test #10 | L164 |
| **Check 3** — Order total: exact sum ($155.00) | test #11 | L174 |
| **Check 3** — Zero-out blocks checkout | test #12 | L182 |
| **Check 3** — Receipt total reflects snapshot | test #13 | L198 |

---

## 7. Out of Scope

- Backend persistence, database integrity, or server-side validation
- Payment processing or PCI compliance
- Authentication or account management
- Firefox, Safari, or mobile browser testing (Chromium only in this engagement)
- Full WCAG accessibility audit — keyboard focus rings (`:focus-visible`) are present and styled; a complete audit is a separate deliverable
