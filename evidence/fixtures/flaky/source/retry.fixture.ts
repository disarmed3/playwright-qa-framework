// SYNTHETIC (Week 4 Task 04): one test fails on attempt 0 and passes on attempt 1, on purpose,
// so the native report marks it 'flaky'. Not a real test; never part of the browser suite.
import { expect, test } from '@playwright/test';

test.describe('synthetic retry', () => {
  test('fails on the first attempt only', () => {
    expect(test.info().retry, 'synthetic: fails on attempt 0 by design').toBeGreaterThan(0);
  });

  test('passes on the first attempt', () => {
    expect(true).toBe(true);
  });
});
