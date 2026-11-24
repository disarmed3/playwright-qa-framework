---
id: tests-store-ui-product
type: test-note
---

# product.spec.ts

<!-- generated:start -->
- **Source:** [tests/store/ui/product.spec.ts](../../../../tests/store/ui/product.spec.ts)
- **SHA-256 (LF-normalised):** `5e6df4f7008421d4a044b1511b7023c5a7f933b09b9355d3282476252e544e80`
- **Parser:** typescript — ok
- **Titles:**
  - `store UI product page (dev only)`
    - `TC-SUI-014 a guest opening the tee product page sees its fixed seed price of 2500 cents as $25.00`
- **Page Object imports:**
  - `ProductPage` — [pages/ProductPage.ts](../../../../pages/ProductPage.ts)
- **Block SHA-256:** `a32d25ddd2772fe664059dda693c199e0793966b8daaae88fea61c303ae13b68`
<!-- generated:end -->

## About this test

Requirement: TC-SUI-014 in [store-ui.md](../../../sources/test-catalog/store-ui.md), "the price
shown is 2500 cents" (tee seed price, `fixed`). Assertions: the price is visible and its text is
exactly `$25.00`, from `usd(seedPrice(TEE))`; the format is observed, not documented (Q8). Adopted
from a recording; last verified result: passed once on dev on 2026-11-11
(`evidence/week4-checks.md` (tag `week6-end`), "Adoption").
