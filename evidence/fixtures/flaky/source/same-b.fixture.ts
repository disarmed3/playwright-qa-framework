// SYNTHETIC (Week 4 Task 04): same describe and test title as same-a.fixture.ts. Fails only in
// project 'beta', on purpose, so exactly one of the four identities fails.
import { expect, test } from '@playwright/test';

test.describe('synthetic same title', () => {
  test('same title', () => {
    expect(test.info().project.name, 'synthetic: fails in project beta by design').toBe('alpha');
  });
});
