---
id: tests-blog-api-auth
type: test-note
---

# auth.spec.ts

<!-- generated:start -->
- **Source:** [tests/blog/api/auth.spec.ts](../../../../tests/blog/api/auth.spec.ts)
- **SHA-256 (LF-normalised):** `60d469183fa5da29eb0634a7d7326d9cc06abe9ca2cca9bc437a3a0ab8f2389e`
- **Parser:** typescript — ok
- **Titles:**
  - `blog API auth (dev only)`
    - `TC-API-010 login returns a token and the full user record`
    - `TC-API-011 a wrong password is rejected with an error and no token`
    - `TC-API-012 an unknown email is rejected with the same error as a wrong password`
    - `TC-API-013 /me returns the user the login token belongs to`
    - `TC-API-014 /me without a token or cookie is rejected with 401`
    - `TC-API-015 the login cookie is HttpOnly, Secure and SameSite=Lax`
    - `TC-API-086 /me with an empty Bearer value and no cookie is rejected with 401`
- **Page Object imports:** none
- **Block SHA-256:** `d6f96aa2d6f7e4d62e976484d5413b4898fe73010a8b512e5639cdd2d7192d70`
<!-- generated:end -->

## About this test

_Not written yet. Explain the requirement, the evidence for each assertion and the last verified
result here, outside the generated block._
