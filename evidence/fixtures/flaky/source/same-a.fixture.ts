// SYNTHETIC (Week 4 Task 04): same describe and test title as same-b.fixture.ts. Run under two
// projects, so one title belongs to four distinct identities. Passes everywhere.
import { expect, test } from '@playwright/test';

test.describe('synthetic same title', () => {
  test('same title', () => {
    expect(true).toBe(true);
  });
});
