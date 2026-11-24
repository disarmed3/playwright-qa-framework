// SYNTHETIC (Week 4 Task 04): the same pass, fail and skip in every run.
import { expect, test } from '@playwright/test';

test.describe('synthetic stable', () => {
  test('always passes', () => {
    expect(true).toBe(true);
  });

  test('always fails', () => {
    expect(1, 'synthetic: always fails by design').toBe(2);
  });

  test('always skipped', () => {
    test.skip(true, 'synthetic: always skipped');
  });
});
