---
id: tests-store-api-coupons
type: test-note
---

# coupons.spec.ts

<!-- generated:start -->
- **Source:** [tests/store/api/coupons.spec.ts](../../../../tests/store/api/coupons.spec.ts)
- **SHA-256 (LF-normalised):** `7ee4ead7baa19960820970f9ba7388f318aaa215f72dd4f35ea2c9d95aebc773`
- **Parser:** typescript — ok
- **Titles:**
  - `store API coupons (dev only)`
    - `TC-SAPI-030 SAVE10 on a 5000-cent subtotal gives a 500 discount and a 4500 total`
    - `TC-SAPI-032 EXPIRED10 is refused with 422 coupon_error "This coupon has expired." and no discount`
    - `TC-SAPI-033 an unknown coupon code is refused with 422 coupon_error "Invalid coupon code." and no discount`
    - `TC-SAPI-074 applying SAVE10 a second time returns 200 and leaves the coupon, discount and total unchanged`
- **Page Object imports:** none
- **Block SHA-256:** `6a7d79a68c62ff776b7636b72cdf5e35391ff419d0a07114705e45b4d321ed18`
<!-- generated:end -->

## About this test

_Not written yet. Explain the requirement, the evidence for each assertion and the last verified
result here, outside the generated block._
