// SYNTHETIC (Week 4 Task 04): the outcome is switched by FLAKY_FIXTURE_VARIANT on purpose, so two
// runs differ. The difference has a known, deliberate cause; it is not real instability.
import { expect, test } from '@playwright/test';

const variant = process.env.FLAKY_FIXTURE_VARIANT ?? '';

test.describe('synthetic cross-run', () => {
  test('passes in variant a and fails in variant b', () => {
    expect(variant, 'synthetic: fails in variant b by design').toBe('a');
  });

  test('passes in both variants', () => {
    expect(true).toBe(true);
  });
});
