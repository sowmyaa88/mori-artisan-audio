import { test, expect } from './fixtures/checkout.fixture';

test.describe('Mori Artisan Audio — Checkout Suite', () => {

  // ── Check 1: Happy path ────────────────────────────────────────────────────
  test.describe('Check 1: Happy path — confirmation, receipt content, idempotency', () => {

    test('valid order produces a MORI- reference, correct customer name, and total paid', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');   // 1 × $65.00
      await checkoutPage.increaseQty('walnut-stand');   // 1 × $45.00
      await checkoutPage.fillName('Eleanor Vance');
      await checkoutPage.placeOrder();

      // Confirmation card visible
      await expect(checkoutPage.confirmationCard).toBeVisible();

      // Reference format: MORI-XXXXXX (6 uppercase alphanumeric chars)
      const ref = await checkoutPage.orderReference.textContent();
      expect(ref).toMatch(/^MORI-[A-Z0-9]{6}$/);

      // Customer name on receipt
      await expect(checkoutPage.receiptCustomer).toHaveText('Eleanor Vance');

      // Total paid: $65.00 + $45.00 = $110.00
      await expect(checkoutPage.receiptTotal).toHaveText('$110.00');

      // Post-order: button permanently disabled, labelled "Order Placed"
      await expect(checkoutPage.placeOrderBtn).toBeDisabled();
      await expect(checkoutPage.placeOrderBtn).toHaveText('Order Placed');

      // "Start New Order" button is present
      await expect(checkoutPage.newOrderBtn).toBeVisible();
    });

    test('rapid double-click on Place Order produces exactly one confirmation card', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');
      await checkoutPage.fillName('Eleanor Vance');

      // Fire two clicks concurrently — the synchronous in-flight guard must absorb the second.
      await Promise.all([
        checkoutPage.placeOrderBtn.click({ force: true }),
        checkoutPage.placeOrderBtn.click({ force: true }),
      ]);

      await expect(checkoutPage.confirmationCard).toBeVisible();
      // Exactly one card — not two, not zero.
      await expect(checkoutPage.page.getByTestId('confirmation-card')).toHaveCount(1);
    });

    test('button is permanently disabled after success; force-click cannot produce a second card', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('walnut-stand');
      await checkoutPage.fillName('Hiroshi Mori');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.confirmationCard).toBeVisible();
      await expect(checkoutPage.placeOrderBtn).toBeDisabled();

      // Force a second click past the disabled attribute — orderPlaced flag must absorb it.
      await checkoutPage.placeOrderBtn.click({ force: true });
      await expect(checkoutPage.page.getByTestId('confirmation-card')).toHaveCount(1);
    });

    test('Start New Order reloads the page to a clean initial state', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');
      await checkoutPage.fillName('Kaspar Dietrich');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.confirmationCard).toBeVisible();

      // Reload via the button — fresh page, no order state carried over.
      await checkoutPage.startNewOrder();

      // Cart reset: quantities at 0, totals at $0.00, button re-enabled.
      await expect(checkoutPage.qtyDisplay('mogami-cable')).toHaveText('0');
      await expect(checkoutPage.qtyDisplay('walnut-stand')).toHaveText('0');
      await expect(checkoutPage.orderTotal).toHaveText('$0.00');
      await expect(checkoutPage.placeOrderBtn).toBeEnabled();
      await expect(checkoutPage.placeOrderBtn).toHaveText('Place Order');
      await expect(checkoutPage.confirmationArea).not.toBeVisible();
    });
  });

  // ── Check 2: Validation and state preservation ─────────────────────────────
  test.describe('Check 2: Validation — empty cart, blank name, input preservation', () => {

    test('empty cart blocks checkout, shows correct message, preserves name input', async ({ checkoutPage }) => {
      // Both products at qty 0 by default.
      await checkoutPage.fillName('Hiroshi Mori');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.validationError).toBeVisible();
      await expect(checkoutPage.validationError).toHaveText(
        'Your cart is empty. Add at least one item to proceed.',
      );
      // No confirmation rendered.
      await expect(checkoutPage.confirmationCard).not.toBeVisible();
      // Name preserved — not wiped.
      await expect(checkoutPage.nameInput).toHaveValue('Hiroshi Mori');
      // Button re-enabled with correct label.
      await expect(checkoutPage.placeOrderBtn).toBeEnabled();
      await expect(checkoutPage.placeOrderBtn).toHaveText('Place Order');
    });

    test('whitespace-only name blocks checkout, shows correct message, preserves the whitespace', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('walnut-stand');
      await checkoutPage.fillName('   ');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.validationError).toBeVisible();
      await expect(checkoutPage.validationError).toHaveText(
        'Full name is required to complete checkout.',
      );
      await expect(checkoutPage.confirmationCard).not.toBeVisible();
      // Whitespace value preserved exactly — not trimmed or cleared.
      await expect(checkoutPage.nameInput).toHaveValue('   ');
      await expect(checkoutPage.placeOrderBtn).toBeEnabled();
      await expect(checkoutPage.placeOrderBtn).toHaveText('Place Order');
    });

    test('after validation failure, correcting all fields results in a successful order', async ({ checkoutPage }) => {
      // Trigger the empty-cart error first.
      await checkoutPage.placeOrder();
      await expect(checkoutPage.validationError).toBeVisible();

      // Now satisfy both conditions.
      await checkoutPage.increaseQty('mogami-cable');
      await checkoutPage.fillName('Kaspar Dietrich');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.confirmationCard).toBeVisible();
      await expect(checkoutPage.orderReference).toContainText('MORI-');
      await expect(checkoutPage.receiptCustomer).toHaveText('Kaspar Dietrich');
    });

    test('quantities are not reset by a failed validation attempt', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');
      await checkoutPage.increaseQty('mogami-cable');   // qty = 2
      // Submit with no name — validation should fail.
      await checkoutPage.placeOrder();
      await expect(checkoutPage.validationError).toBeVisible();

      // Quantity and line total must be unchanged.
      await expect(checkoutPage.qtyDisplay('mogami-cable')).toHaveText('2');
      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$130.00');
    });
  });

  // ── Check 3: Quantity math integrity ──────────────────────────────────────
  test.describe('Check 3: Quantity math — line totals and order total precision', () => {

    test('cable line total tracks qty changes: $0.00 → $65.00 → $130.00 → $65.00', async ({ checkoutPage }) => {
      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$0.00');

      await checkoutPage.increaseQty('mogami-cable');
      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$65.00');

      await checkoutPage.increaseQty('mogami-cable');
      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$130.00');

      await checkoutPage.decreaseQty('mogami-cable');
      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$65.00');
    });

    test('stand line total tracks qty changes: $0.00 → $45.00 → $90.00', async ({ checkoutPage }) => {
      await expect(checkoutPage.lineTotal('walnut-stand')).toHaveText('$0.00');

      await checkoutPage.increaseQty('walnut-stand');
      await expect(checkoutPage.lineTotal('walnut-stand')).toHaveText('$45.00');

      await checkoutPage.increaseQty('walnut-stand');
      await expect(checkoutPage.lineTotal('walnut-stand')).toHaveText('$90.00');
    });

    test('order total equals the exact sum of all line totals', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');   // $65.00
      await checkoutPage.increaseQty('walnut-stand');   // $45.00
      await checkoutPage.increaseQty('walnut-stand');   // $90.00 (2×)
      // $65.00 + $90.00 = $155.00
      await expect(checkoutPage.orderTotal).toHaveText('$155.00');
    });

    test('decreasing qty to zero zeroes the line total and blocks checkout', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');
      await checkoutPage.decreaseQty('mogami-cable');

      await expect(checkoutPage.lineTotal('mogami-cable')).toHaveText('$0.00');
      await expect(checkoutPage.orderTotal).toHaveText('$0.00');

      // Empty cart — Place Order must show validation, not a confirmation.
      await checkoutPage.fillName('Somebody');
      await checkoutPage.placeOrder();
      await expect(checkoutPage.validationError).toHaveText(
        'Your cart is empty. Add at least one item to proceed.',
      );
      await expect(checkoutPage.confirmationCard).not.toBeVisible();
    });

    test('receipt line items and total reflect the exact quantities ordered', async ({ checkoutPage }) => {
      await checkoutPage.increaseQty('mogami-cable');   // 1 × $65.00
      await checkoutPage.increaseQty('walnut-stand');   // 1 × $45.00
      await checkoutPage.increaseQty('walnut-stand');   // 2 × $45.00 = $90.00
      await checkoutPage.fillName('Receipt Verifier');
      await checkoutPage.placeOrder();

      await expect(checkoutPage.confirmationCard).toBeVisible();
      // Total on receipt must be $155.00, not $0.00 (snapshot-before-reset bug guard).
      await expect(checkoutPage.receiptTotal).toHaveText('$155.00');
    });
  });
});
