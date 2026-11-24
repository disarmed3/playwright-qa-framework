---
id: tests-store-api-checkout
type: test-note
---

# checkout.spec.ts

<!-- generated:start -->
- **Source:** [tests/store/api/checkout.spec.ts](../../../../tests/store/api/checkout.spec.ts)
- **SHA-256 (LF-normalised):** `105a3e627bc96ccda1aa035c327366eae12a0061097daea951e2c172652d0d55`
- **Parser:** typescript — ok
- **Titles:**
  - `store API checkout and mock payment (dev only)`
    - `TC-SAPI-042 checkout from a context with no cart is refused with 422 empty_cart and "Your cart is empty."`
    - `TC-SAPI-041 checkout validation refuses missing fields with schema 400 and blank or invalid values with 422 validation_error messages`
    - `TC-SAPI-050 paying a fresh pending order with the approved mock card returns 200, pays the order and records an approved payment`
    - `TC-SAPI-051 paying with the declined mock card returns 402 payment_declined, fails the order and records a declined payment`
    - `TC-SAPI-052 paying with the gateway-error mock card returns 502 gateway_error, leaves the order pending and records an error payment`
    - `TC-SAPI-053 paying with an undocumented Luhn-valid card returns 422 card_invalid, leaves the order pending and saves no payment`
- **Page Object imports:** none
- **Block SHA-256:** `5dfbd56502cbed47122feb6e893781c168690c6d9f4d317a81b0db5cdb167097`
<!-- generated:end -->

## About this test

_Not written yet. Explain the requirement, the evidence for each assertion and the last verified
result here, outside the generated block._
