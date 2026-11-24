---
id: tests-store-api-cart
type: test-note
---

# cart.spec.ts

<!-- generated:start -->
- **Source:** [tests/store/api/cart.spec.ts](../../../../tests/store/api/cart.spec.ts)
- **SHA-256 (LF-normalised):** `bf5dd77ba4181b7d112918724b660e29c7219c66a1c028e08d1c119c0bb90e29`
- **Parser:** typescript — ok
- **Titles:**
  - `store API cart (dev only)`
    - `TC-SAPI-021 adding a variant creates one line at the product price, and line total, subtotal and total equal quantity times price`
    - `TC-SAPI-022 adding the same variant twice raises the quantity of one line instead of adding a second`
    - `TC-SAPI-023 adding more than the stock returns 422 cart_error and leaves the owned cart unchanged`
    - `TC-SAPI-025 changing a line quantity recalculates line total, subtotal and total, and quantity 0 removes the line`
    - `TC-SAPI-027 deleting one of two lines removes it and recomputes subtotal and total from the remaining line`
- **Page Object imports:** none
- **Block SHA-256:** `1f529dc89bb1048c43151edb0e5482c5fb437c5b4c5a74e0e5d2689ffe1e48df`
<!-- generated:end -->

## About this test

_Not written yet. Explain the requirement, the evidence for each assertion and the last verified
result here, outside the generated block._
