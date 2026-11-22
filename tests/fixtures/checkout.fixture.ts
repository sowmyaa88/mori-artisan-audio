import { test as base, type Page, type Locator } from '@playwright/test';

class CheckoutPage {
  readonly page: Page;

  readonly nameInput:        Locator;
  readonly placeOrderBtn:    Locator;
  readonly validationError:  Locator;
  readonly confirmationArea: Locator;
  readonly confirmationCard: Locator;
  readonly orderReference:   Locator;
  readonly receiptCustomer:  Locator;
  readonly receiptTotal:     Locator;
  readonly orderTotal:       Locator;
  readonly newOrderBtn:      Locator;

  constructor(page: Page) {
    this.page              = page;
    this.nameInput         = page.getByTestId('customer-name');
    this.placeOrderBtn     = page.getByTestId('place-order-btn');
    this.validationError   = page.getByTestId('validation-error');
    this.confirmationArea  = page.getByTestId('confirmation-area');
    this.confirmationCard  = page.getByTestId('confirmation-card');
    this.orderReference    = page.getByTestId('order-reference');
    this.receiptCustomer   = page.getByTestId('receipt-customer');
    this.receiptTotal      = page.getByTestId('receipt-total');
    this.orderTotal        = page.getByTestId('order-total');
    this.newOrderBtn       = page.getByTestId('new-order-btn');
  }

  increaseQty(productId: string): Promise<void> {
    return this.page.getByTestId(`qty-increase-${productId}`).click();
  }

  decreaseQty(productId: string): Promise<void> {
    return this.page.getByTestId(`qty-decrease-${productId}`).click();
  }

  qtyDisplay(productId: string): Locator {
    return this.page.getByTestId(`qty-display-${productId}`);
  }

  lineTotal(productId: string): Locator {
    return this.page.getByTestId(`line-total-${productId}`);
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderBtn.click();
  }

  // Clicks "Start New Order" and waits for the resulting page reload to settle.
  async startNewOrder(): Promise<void> {
    await this.newOrderBtn.click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}

type Fixtures = { checkoutPage: CheckoutPage };

export const test = base.extend<Fixtures>({
  checkoutPage: async ({ page }, use) => {
    // Every test opens a fresh page — no shared session state.
    await page.goto('/');
    const checkout = new CheckoutPage(page);
    await use(checkout);
  },
});

export { expect } from '@playwright/test';
