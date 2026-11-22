type ProductId = 'mogami-cable' | 'walnut-stand';

interface Product {
  name: string;
  price: number;
}

const products: Record<ProductId, Product> = {
  'mogami-cable': { name: 'Mogami 4-Pin XLR Headphone Cable', price: 65.00 },
  'walnut-stand': { name: 'Walnut Desktop Headphone Stand',   price: 45.00 },
};

const qty: Record<ProductId, number> = {
  'mogami-cable': 0,
  'walnut-stand': 0,
};

const productIds: ProductId[] = ['mogami-cable', 'walnut-stand'];

// Permanently true after a successful submission. Blocks all subsequent handler entry.
let orderPlaced = false;

const qs = <T extends Element>(sel: string): T =>
  document.querySelector(sel) as T;

function renderTotals(): void {
  let grandTotal = 0;
  productIds.forEach((id) => {
    const lineTotal = qty[id] * products[id].price;
    grandTotal += lineTotal;
    qs(`[data-testid="qty-display-${id}"]`).textContent = String(qty[id]);
    qs(`[data-testid="line-total-${id}"]`).textContent = '$' + lineTotal.toFixed(2);
  });
  qs('[data-testid="order-total"]').textContent = '$' + grandTotal.toFixed(2);
}

// Accepts a snapshot of quantities taken BEFORE state is reset, so the receipt
// reflects what the customer actually ordered, not the zeroed-out post-reset state.
function buildReceiptHTML(
  ref: string,
  customerName: string,
  snapshot: Record<ProductId, number>,
  grandTotal: number,
): string {
  const lineItems = productIds
    .filter((id) => snapshot[id] > 0)
    .map((id) => {
      const { name, price } = products[id];
      const count = snapshot[id];
      return `<tr>
        <td class="receipt-qty">${count}&times;</td>
        <td class="receipt-desc">${name}</td>
        <td class="receipt-amount">$${(count * price).toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div data-testid="confirmation-card">
      <dl class="receipt-meta">
        <div class="receipt-row">
          <dt>Order Reference</dt>
          <dd data-testid="order-reference">${ref}</dd>
        </div>
        <div class="receipt-row">
          <dt>Customer</dt>
          <dd data-testid="receipt-customer">${customerName}</dd>
        </div>
      </dl>
      <table class="receipt-items">
        <tbody>${lineItems}</tbody>
      </table>
      <div class="receipt-total-row">
        <span>Total Paid</span>
        <span class="receipt-amount" data-testid="receipt-total">$${grandTotal.toFixed(2)}</span>
      </div>
      <button
        type="button"
        class="new-order-btn"
        data-testid="new-order-btn"
        onclick="location.reload()"
      >Start New Order</button>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderTotals();

  productIds.forEach((id) => {
    qs<HTMLButtonElement>(`[data-testid="qty-increase-${id}"]`).addEventListener(
      'click',
      () => {
        if (orderPlaced) return;
        qty[id]++;
        renderTotals();
      }
    );
    qs<HTMLButtonElement>(`[data-testid="qty-decrease-${id}"]`).addEventListener(
      'click',
      () => {
        if (orderPlaced) return;
        if (qty[id] > 0) {
          qty[id]--;
          renderTotals();
        }
      }
    );
  });

  const form      = qs<HTMLFormElement>('#checkout-form');
  const btn       = qs<HTMLButtonElement>('[data-testid="place-order-btn"]');
  const nameInput = qs<HTMLInputElement>('[data-testid="customer-name"]');
  const errorEl   = qs<HTMLElement>('[data-testid="validation-error"]');
  const area      = qs<HTMLElement>('[data-testid="confirmation-area"]');

  form.addEventListener('submit', (e: Event) => {
    // ── Synchronous guards — execute before anything else ─────────────────────
    if (orderPlaced) {
      e.preventDefault();
      return;
    }
    if (btn.dataset.submitting === 'true') {
      e.preventDefault();
      return;
    }
    btn.dataset.submitting = 'true';
    btn.disabled = true;
    e.preventDefault();
    // ── end synchronous section ───────────────────────────────────────────────

    // Restores the button to its pre-submit state on validation failure.
    // Never touches nameInput.value or any quantity — preservation by omission.
    const showError = (msg: string): void => {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Place Order';
      delete btn.dataset.submitting;
    };

    const totalQty = productIds.reduce((sum, id) => sum + qty[id], 0);

    if (totalQty === 0) {
      showError('Your cart is empty. Add at least one item to proceed.');
      return;
    }
    if (nameInput.value.trim() === '') {
      showError('Full name is required to complete checkout.');
      return;
    }

    // ── Validation passed ─────────────────────────────────────────────────────
    errorEl.style.display = 'none';

    // Capture order data NOW — before state is mutated below.
    const grandTotal   = productIds.reduce((sum, id) => sum + qty[id] * products[id].price, 0);
    const ref          = 'MORI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const customerName = nameInput.value.trim();
    // Deep-copy the quantities so the receipt snapshot is immutable.
    const qtySnapshot  = { ...qty } as Record<ProductId, number>;

    // Set permanent lock before any DOM write.
    orderPlaced = true;

    // Mark the cart section as inert so qty buttons are visually locked.
    qs<HTMLElement>('section').dataset.orderPlaced = 'true';

    // Render receipt using the pre-reset snapshot.
    area.innerHTML     = buildReceiptHTML(ref, customerName, qtySnapshot, grandTotal);
    area.style.display = 'block';

    // Reset cart display — the form is now closed, this is purely cosmetic.
    productIds.forEach((id) => { qty[id] = 0; });
    renderTotals();

    nameInput.value  = '';
    btn.disabled     = true;
    btn.textContent  = 'Order Placed';
    delete btn.dataset.submitting;
  });
});
