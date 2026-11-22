# Mori Artisan Audio — Checkout & Test Suite

A production-grade storefront and Playwright test suite for Mori Artisan Audio, a specialty shop for bespoke headphone cables and wooden headphone stands.

## Prerequisites

- Node.js 20 or later
- npm 10 or later

## Setup

```bash
npm install
npx playwright install chromium
```

## Running Locally

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Running the Test Suite

Run all tests (Vite starts automatically via `webServer`):

```bash
npm test
```

Run tests in a headed browser (useful for debugging):

```bash
npm run test:headed
```

## Project Structure

```
mori-artisan-audio/
├── src/
│   ├── index.html          # Storefront markup
│   ├── main.ts             # Cart logic and form handling
│   └── style.css           # Tactile, restrained styling
├── tests/
│   ├── fixtures/
│   │   └── checkout.fixture.ts   # Playwright fixture extension
│   └── checkout.spec.ts          # Automated test suite
├── playwright.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Test Coverage

| Priority | Area | Tests |
|----------|------|-------|
| P0 | Happy path / order confirmation | Check 1 |
| P0 | Validation, input preservation | Check 2 |
| P0 | Quantity math integrity | Check 3 |

See [TEST_PLAN.md](./TEST_PLAN.md) for the full QA risk matrix, manual test records, and defect log.

## Technical Notes

- **Idempotency**: The Place Order button is synchronously locked (`data-submitting="true"`, `disabled`) on first click before any validation runs, preventing double-submission entirely at the DOM level.
- **No arbitrary waits**: The Playwright suite uses only web-first auto-retrying assertions — `page.waitForTimeout` is not used anywhere.
- **Zero CSS-class selectors**: Tests query exclusively via ARIA roles, labels, and `data-testid` attributes.
