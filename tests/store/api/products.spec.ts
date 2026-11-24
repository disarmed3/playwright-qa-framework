import { expect } from '@playwright/test';
import { runIfEnv } from '../../../env/runIfEnv';
import { isRecord, readEntity } from '../../support/api';
import { seedFact } from '../../support/seed-facts';
import { readError, seedPrice, TEE, test, variantsOf } from '../../support/store';

// Read only: guest requests with no cookie; nothing is created. Envelope fields, the tee's labels
// and codes come from Jira SCRUM-33 (read 2026-10-31); the tee's price from the mentor's starting
// data (fixed fact). Counts and stock change in normal use: the product total is recorded against the
// seeded 8, not failed on (mentor 2026-11-07, item 11). Error fields: mentor 2026-11-07, item 6.

test.describe('store API products (dev only)', { tag: '@regression' }, () => {
  runIfEnv(test, ['dev']);

  test(
    'TC-SAPI-001 the product list returns the paged envelope on page 1 with page size 12 and only active products',
    { tag: '@smoke' },
    async ({ guestApi }) => {
      const response = await guestApi.get('/api/products');

      expect(response.status()).toBe(200);
      const body: unknown = await response.json();
      expect(isRecord(body)).toBe(true);
      for (const key of ['items', 'page', 'pageSize', 'total', 'totalPages']) {
        expect(body, `envelope field ${key}`).toHaveProperty(key);
      }

      const envelope = body as Record<string, unknown>;
      expect(envelope).toMatchObject({ page: 1, pageSize: 12 });
      const items = envelope.items as Record<string, unknown>[];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      // Pagination consistency (item 11): one page never holds more than pageSize or total items.
      expect(items.length).toBeLessThanOrEqual(12);
      expect(items.length).toBeLessThanOrEqual(envelope.total as number);
      for (const item of items) {
        expect(item.active, `product ${String(item.slug)} is active`).toBe(true);
      }

      // Drift, not a failure: record today's total beside the seeded value (item 11, Q22).
      const info = test.info();
      info.annotations.push({
        type: 'drift',
        description: `products total: seeded ${seedFact('count', 'products').expected}, today ${String(envelope.total)} (${new Date().toISOString().slice(0, 10)})`,
      });
    },
  );

  test('TC-SAPI-009 product detail returns the classic tee at its seed price with S, M, L and XL variants that each carry stock', async ({
    guestApi,
  }) => {
    const response = await guestApi.get(`/api/products/${TEE}`);

    expect(response.status()).toBe(200);
    const product = readEntity(await response.json());
    expect(product.slug).toBe(TEE);
    expect(product.price_cents).toBe(seedPrice(TEE));
    const variants = variantsOf(product);
    expect(variants.map((variant) => variant.label).sort()).toEqual(['L', 'M', 'S', 'XL']);
    for (const variant of variants) {
      expect(Number.isInteger(variant.stock), `variant ${String(variant.label)} stock`).toBe(true);
      expect(variant.stock as number).toBeGreaterThanOrEqual(0);
    }
  });

  test('TC-SAPI-010 an unknown product slug returns 404 not_found', async ({
    guestApi,
    nameFor,
  }) => {
    // An owned qa-auto name cannot be a product slug, so the product surely does not exist.
    const response = await guestApi.get(`/api/products/${nameFor()}`);

    expect(response.status()).toBe(404);
    // SCRUM-66 names the code; the mentor names the field (body.error).
    expect((await readError(response)).error).toBe('not_found');
  });
});
