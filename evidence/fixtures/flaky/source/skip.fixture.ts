// SYNTHETIC (Week 4 Task 04): one test is skipped in variant a only, on purpose.
import { expect, test } from '@playwright/test';

const variant = process.env.FLAKY_FIXTURE_VARIANT ?? '';

test.describe('synthetic partial skip', () => {
  test('skipped in variant a only', () => {
    test.skip(variant === 'a', 'synthetic: skipped in variant a');
    expect(true).toBe(true);
  });

  test('passes in both variants', () => {
    expect(true).toBe(true);
  });
});
