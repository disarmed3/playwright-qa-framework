// Store API helpers and fixtures (Week 4 Task 01). Routes and request fields come from the dev
// OpenAPI (read 2026-11-07, SHA-256 8f2ef695…, same as the 2026-10-30 snapshot); statuses, codes and
// messages from Jira SCRUM-33/34/35/36/37 (read 2026-10-31 and 2026-11-07); prices and coupon terms
// from the mentor's starting data through seed-facts.ts; response fields, totals, error fields and
// cleanup from the mentor's answers of 2026-11-07. A question still open keeps its gate closed in
// STORE_GATES and its test is a named skip.
// Every write starts inside envGuard(() => …). No helper logs a cookie, token or account value.
// Plain Node may load this file: local imports carry .ts, TypeScript is erasable only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { APIRequestContext, APIResponse, Response, TestInfo } from '@playwright/test';
import { envGuard } from '../../env/envGuard.ts';
import type { SkipTest } from '../../env/runIfEnv.ts';
import {
  isRecord,
  readEntity,
  test as apiTest,
  withOwnedRecords,
  type ApiClient,
  type OwnedRecords,
} from './api.ts';
import { SEED_FACTS, seedFact } from './seed-facts.ts';

type Json = Record<string, unknown>;

// ---------------------------------------------------------------------------------------------
// Gates. Each one stays closed until the confirming product note is recorded in
// vault/sources/product/ and reviewed; a closed gate skips its tests with a named reason.
// Questions: vault/sources/test-catalog/store-api.md (Q36, Q39 to Q43).

/** Cart response names (mentor 2026-11-07, item 3; Q39). */
export interface CartFieldNames {
  /** The key of a cart line's id (PATCH and DELETE /api/cart/items/{id}). */
  lineId: string;
  /** The cart's discount in cents. */
  discount: string;
  /** The cart's total in cents. */
  total: string;
}

/** A student-owned checkout allocation issued by the mentor (Q43). */
export interface CheckoutAllocation {
  owner: string;
  /** The product note (and item) that records it, under vault/sources/product/. */
  source: string;
  productSlug: string;
  variantId: number;
  /** Checkouts this allocation allows in one run; each one leaves an order. */
  maxCheckoutsPerRun: number;
  /** ISO date; an expired allocation is closed. */
  expiresAt: string;
  /**
   * Whether the mentor confirmed the variant is reserved for this student. Until true, exact stock
   * comparisons stay pending: the payment tests record stock before and after, they do not assert it.
   */
  exclusiveVariant: boolean;
  /** The budget is one run (item 8): set to the run date after that run, which closes the gate. */
  usedOn: string | undefined;
}

/**
 * The one-run allocation for the two Store UI checkout journeys (mentor 2026-11-12, Q47). The limit
 * counts orders: an order exists only after Place order is pressed, so each journey writes a claim
 * (UI_CHECKOUT_CLAIMS) just before its press and never presses again.
 */
export interface UiCheckoutAllocation {
  owner: string;
  /** The product note (and item) that records it, under vault/sources/product/. */
  source: string;
  productSlug: string;
  variantId: number;
  /** The catalog cases allowed to press Place order, one press each. */
  cases: readonly string[];
  /** Orders this allocation allows in total. */
  maxOrders: number;
  /** ISO time; an expired allocation is closed. */
  expiresAt: string;
  /** Set to the run date after the run (mentor: "one-run allocation used on <date>"). */
  usedOn: string | undefined;
}

export interface StoreGates {
  /** M1 (Q42): each cart test may leave its own empty guest cart row (no cart delete API). */
  cartRowMayRemain: boolean;
  /** M2 (Q39): cart line id, discount and total names. */
  cartFields: CartFieldNames | undefined;
  /** M3 (Q41): the documented rule for applying the same coupon twice, as its dated source. */
  couponReapplyRule: string | undefined;
  /** M4 (Q40): 400 (schema) or 422 (app) for checkout with missing fields. */
  missingFieldStatus: 400 | 422 | undefined;
  /** M5 (Q43): student-owned checkout allocation. */
  checkoutAllocation: CheckoutAllocation | undefined;
  /** M6 (Q36): the approved way to observe that no payment was saved, as its dated source. */
  noPaymentObservation: string | undefined;
  /** Q47: the Store UI checkout allocation (TC-SUI-031, 032). */
  uiCheckoutAllocation: UiCheckoutAllocation | undefined;
}

/** Store API facts and agreements, cited by item number. */
const STORE_API_NOTE = 'vault/sources/product/store-api.md';
/** The Store UI checkout allocation and journeys (Q47, Q49). */
const STORE_UI_CHECKOUT_NOTE = 'vault/sources/product/store-ui-checkout.md';

export const STORE_GATES: StoreGates = {
  // Item 2: each test may leave its own empty guest-cart row after cleanup.
  cartRowMayRemain: true,
  // Item 3: { cart: {...} } with cart.items[].item_id, cart.discount_cents, cart.total_cents.
  cartFields: { lineId: 'item_id', discount: 'discount_cents', total: 'total_cents' },
  // Item 5: a second application returns 200 and leaves code, discount and total unchanged.
  couponReapplyRule: `${STORE_API_NOTE} item 5`,
  // Item 7: missing required properties (including {}) fail schema validation with 400.
  missingFieldStatus: 400,
  // Item 8: one run, at most 4 checkouts, one payment attempt each, no retries;
  // Deterministic Cap, One Size, variant 11, through 2026-12-31. Exclusivity not confirmed.
  checkoutAllocation: {
    owner: 'repository owner (student)',
    source: `${STORE_API_NOTE} item 8`,
    productSlug: 'deterministic-cap',
    variantId: 11,
    maxCheckoutsPerRun: 4,
    expiresAt: '2026-12-31T23:59:59Z',
    exclusiveVariant: false,
    // Used by the approved run 20261107T191145Z (orders 3274 to 3277); a new run needs a new allocation.
    usedOn: '2026-11-07',
  },
  // Item 10: GET /api/orders/{id} returns { order, items, payment }; a rejected card saves no payment.
  noPaymentObservation: `${STORE_API_NOTE} item 10`,
  // Q47: one run for the two browser journeys only (the API allocation above stays closed); at most
  // 2 orders, one press per journey, --workers=1 --retries=0; variant 11 reserved for the owner; both
  // orders stay on dev. "Expires 2026-11-18" read as its start, UTC (owner decision 2026-11-12).
  uiCheckoutAllocation: {
    owner: 'repository owner (student)',
    source: STORE_UI_CHECKOUT_NOTE,
    productSlug: 'deterministic-cap',
    variantId: 11,
    cases: ['TC-SUI-031', 'TC-SUI-032'],
    maxOrders: 2,
    expiresAt: '2026-11-18T00:00:00Z',
    // Used by the approved run 20261112T204457Z (TC-SUI-031 order 3278; TC-SUI-032 failed order,
    // identified by its test email). The journeys are never repeated (mentor 2026-11-12).
    usedOn: '2026-11-12',
  },
};

export type GateName = keyof StoreGates;

const GATE_REASONS: Record<GateName, string> = {
  cartRowMayRemain: 'mentor M1 (Q42): may a cart test leave its own empty guest cart row?',
  cartFields: 'mentor M2 (Q39): cart line id, discount and total field names not confirmed',
  couponReapplyRule: 'mentor M3 (Q41): no documented rule for applying the same coupon twice',
  missingFieldStatus: 'mentor M4 (Q40): SCRUM-84 says 422, SCRUM-36 says schema 400',
  checkoutAllocation:
    'mentor M5 (Q43): no open checkout allocation (missing, expired, or its one-run budget is used)',
  noPaymentObservation: 'mentor M6 (Q36): no approved way to observe that no payment was saved',
  uiCheckoutAllocation:
    'mentor 2026-11-12 (Q47): no open Store UI checkout allocation (missing or expired)',
};

function gateReason(name: GateName, gates: StoreGates = STORE_GATES): string {
  const usedOn = gates.uiCheckoutAllocation?.usedOn;
  if (name === 'uiCheckoutAllocation' && usedOn !== undefined) {
    return `one-run allocation used on ${usedOn}`;
  }
  return GATE_REASONS[name];
}

function gateOpen(name: GateName, gates: StoreGates = STORE_GATES): boolean {
  if (name === 'uiCheckoutAllocation') {
    const allocation = gates.uiCheckoutAllocation;
    return (
      allocation !== undefined &&
      allocation.usedOn === undefined &&
      Date.parse(allocation.expiresAt) > Date.now()
    );
  }
  if (name === 'checkoutAllocation') {
    const allocation = gates.checkoutAllocation;
    return (
      allocation !== undefined &&
      allocation.usedOn === undefined &&
      Date.parse(allocation.expiresAt) > Date.now()
    );
  }
  const value = gates[name];
  return value !== undefined && value !== false;
}

/** Skips the current test with the gate's named reason while the gate is closed. */
export function requireGate(test: SkipTest, name: GateName): void {
  test.skip(!gateOpen(name), `blocked: ${gateReason(name)}`);
}

/**
 * Gates per catalog case, beyond the two cart gates every `ownedCart` test has. The cart fixture
 * applies these first, before any request, so a skipped case names its own blocker. Keyed by the
 * catalog ID that starts the test title (rule 50).
 */
export const CASE_GATES: Readonly<Record<string, readonly GateName[]>> = {
  'TC-SAPI-041': ['missingFieldStatus'],
  'TC-SAPI-050': ['checkoutAllocation'],
  'TC-SAPI-051': ['checkoutAllocation'],
  'TC-SAPI-052': ['checkoutAllocation'],
  'TC-SAPI-053': ['checkoutAllocation', 'noPaymentObservation'],
  'TC-SAPI-074': ['couponReapplyRule'],
  // Store UI checkout journeys (Week 4 Task 02): they place orders under their own allocation (Q47,
  // mentor 2026-11-12), and each skips once its claim exists.
  'TC-SUI-031': ['uiCheckoutAllocation'],
  'TC-SUI-032': ['uiCheckoutAllocation'],
};

/**
 * Applies the case's own gates (by the catalog ID at the start of its title). A UI checkout journey
 * that already pressed Place order (its claim exists) is skipped too: the journey is never repeated.
 */
export function requireCaseGates(testInfo: Pick<TestInfo, 'title' | 'skip'>): void {
  const id = /^TC-[A-Z]+-\d+[a-z]?(?= )/.exec(testInfo.title)?.[0];
  const gates = (id !== undefined ? CASE_GATES[id] : undefined) ?? [];
  for (const name of gates) {
    requireGate(testInfo, name);
  }
  if (id !== undefined && gates.includes('uiCheckoutAllocation')) {
    const claimed = uiCheckoutClaimedOn(id);
    testInfo.skip(
      claimed !== undefined,
      `blocked: one-run allocation used on ${String(claimed)} (claim recorded before Place order)`,
    );
  }
}

function openValue<T>(value: T | undefined, name: GateName): T {
  if (value === undefined) throw new Error(`store gate ${name} is closed`);
  return value;
}

export const checkoutAllocation = (): CheckoutAllocation =>
  openValue(STORE_GATES.checkoutAllocation, 'checkoutAllocation');
export const missingFieldStatus = (): 400 | 422 =>
  openValue(STORE_GATES.missingFieldStatus, 'missingFieldStatus');
export const uiCheckoutAllocation = (): UiCheckoutAllocation =>
  openValue(STORE_GATES.uiCheckoutAllocation, 'uiCheckoutAllocation');

// ---------------------------------------------------------------------------------------------
// Claims for the Store UI checkout allocation (mentor 2026-11-12: "After the press, don't repeat
// that journey, even if an assertion failed"). Local, ignored (.gitignore `evidence/raw/`); written
// just before Place order, never deleted by code. Paths are relative to the repository root, where
// `npm test` runs.

export const UI_CHECKOUT_CLAIMS = 'evidence/raw/week4/store-ui-checkout/claims.json';

export interface UiCheckoutClaim {
  caseId: string;
  /** ISO time just before the press. */
  claimedAt: string;
  /** The order's unique synthetic email; the failed order is identified by it (mentor). */
  email: string;
  source: string;
}

function isClaim(value: unknown): value is UiCheckoutClaim {
  return (
    isRecord(value) &&
    typeof value.caseId === 'string' &&
    typeof value.claimedAt === 'string' &&
    typeof value.email === 'string' &&
    typeof value.source === 'string'
  );
}

/** Every recorded press; a missing file means none. An unreadable file fails (no press follows). */
export function readUiCheckoutClaims(file = UI_CHECKOUT_CLAIMS): UiCheckoutClaim[] {
  const path = resolve(file);
  if (!existsSync(path)) return [];
  const body: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(body) || !body.every(isClaim)) {
    throw new Error(`${file}: not a list of claims; review it by hand, never delete it`);
  }
  return body;
}

/** The date (YYYY-MM-DD) a case pressed Place order, or undefined. */
export function uiCheckoutClaimedOn(caseId: string, file = UI_CHECKOUT_CLAIMS): string | undefined {
  return readUiCheckoutClaims(file)
    .find((claim) => claim.caseId === caseId)
    ?.claimedAt.slice(0, 10);
}

/**
 * Records one press for `caseId` before it happens. Refuses (so the test fails before the press)
 * when the allocation is closed or expired, the case is not allocated, it already pressed, the
 * order limit is reached, or the repository root is not the working folder.
 */
export function claimUiCheckout(
  testInfo: Pick<TestInfo, 'annotations'>,
  caseId: string,
  email: string,
  file = UI_CHECKOUT_CLAIMS,
): void {
  const allocation = uiCheckoutAllocation();
  if (allocation.usedOn !== undefined || Date.parse(allocation.expiresAt) <= Date.now()) {
    throw new Error(
      'Store UI checkout allocation is closed or expired; Place order is not pressed',
    );
  }
  if (!allocation.cases.includes(caseId)) {
    throw new Error(`${caseId} is not allocated; Place order is not pressed`);
  }
  const claims = readUiCheckoutClaims(file);
  if (claims.some((claim) => claim.caseId === caseId)) {
    throw new Error(`${caseId} already pressed Place order; the journey is never repeated`);
  }
  if (claims.length >= allocation.maxOrders) {
    throw new Error(`the allocation's ${allocation.maxOrders} orders are used; no press`);
  }
  if (!existsSync(resolve('package.json')) || !existsSync(resolve('evidence'))) {
    throw new Error('claims: run from the repository root; no press');
  }
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  const claim: UiCheckoutClaim = {
    caseId,
    claimedAt: new Date().toISOString(),
    email,
    source: allocation.source,
  };
  writeFileSync(path, `${JSON.stringify([...claims, claim], null, 2)}\n`);
  testInfo.annotations.push({
    type: 'retained',
    description: `${caseId}: Place order pressed under ${allocation.source}; the order stays on dev, identified by ${email}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Seed facts and products (read only)

/** The tee named by SCRUM-65 and the starting data. */
export const TEE = 'codemify-classic-tee';

/** Minimum stock for a variant a cart test uses; a margin against other learners' purchases. */
export const MIN_STOCK = 5;

/** The fixed price in cents from the starting data (fails when the row is missing or unapproved). */
export function seedPrice(slug: string): number {
  const cents = Number(seedFact('price', slug).expected);
  if (!Number.isInteger(cents) || cents <= 0)
    throw new Error(`starting data: bad price for ${slug}`);
  return cents;
}

/** The slugs of the eight priced products in the starting data. */
export function seedSlugs(): string[] {
  return SEED_FACTS.filter((fact) => fact.check === 'price' && fact.status === 'approved').map(
    (fact) => fact.key,
  );
}

/** Product detail (`GET /api/products/{slug}`): the product record. Read only, no cookie needed. */
export async function readProduct(client: ApiClient, slug: string): Promise<Json> {
  const response = await client.get(`/api/products/${slug}`);
  if (response.status() !== 200) {
    throw new Error(`setup: product ${slug} returned ${response.status()}`);
  }
  return readEntity(await response.json());
}

/** The product's `variants[]` (SCRUM-65). */
export function variantsOf(product: Json): Json[] {
  if (!Array.isArray(product.variants)) throw new Error('product has no variants list');
  return product.variants.filter(isRecord);
}

export interface PickedVariant {
  slug: string;
  variantId: number;
  price: number;
}

/**
 * Up to `count` variants of different seed products with at least `minStock` units today. Stock is a
 * precondition only, never an expected value; carts do not consume it (mentor 2026-10-30).
 */
export async function pickVariants(
  client: ApiClient,
  count: number,
  minStock = MIN_STOCK,
  slugs = seedSlugs(),
): Promise<PickedVariant[]> {
  const picked: PickedVariant[] = [];
  for (const slug of slugs) {
    if (picked.length === count) break;
    const variant = variantsOf(await readProduct(client, slug)).find(
      (candidate) =>
        Number.isInteger(candidate.id) &&
        typeof candidate.stock === 'number' &&
        candidate.stock >= minStock,
    );
    if (variant !== undefined) {
      picked.push({ slug, variantId: variant.id as number, price: seedPrice(slug) });
    }
  }
  return picked;
}

/** Skips with a named reason when too few variants have stock today; shared stock is never reset. */
export function requirePicked(
  test: SkipTest,
  picked: readonly PickedVariant[],
  count: number,
): void {
  test.skip(
    picked.length < count,
    `precondition: fewer than ${count} seed product(s) with a variant of stock >= ${MIN_STOCK} today; shared stock is never reset`,
  );
}

/**
 * Records (does not assert) an allocated variant's stock before and after a payment, with the expected
 * effect from the mentor's outcome list. Exact stock comparisons stay pending until the mentor confirms
 * the variant is exclusive (2026-11-07 follow-up); other learners may change the same stock.
 */
export function recordStockEffect(
  testInfo: Pick<TestInfo, 'annotations'>,
  allocation: CheckoutAllocation,
  before: number,
  after: number,
  expected: string,
): void {
  testInfo.annotations.push({
    type: 'stock-observation',
    description: `variant ${allocation.variantId} (${allocation.productSlug}): before ${before}, after ${after}; expected ${expected}; not asserted (exclusive: ${String(allocation.exclusiveVariant)})`,
  });
}

/** A product's name and one variant's label (product detail), for what the browser shows. */
export async function variantFacts(
  client: ApiClient,
  slug: string,
  variantId: number,
): Promise<{ name: string; label: string }> {
  const product = await readProduct(client, slug);
  const variant = variantsOf(product).find((item) => item.id === variantId);
  if (typeof product.name !== 'string' || typeof variant?.label !== 'string') {
    throw new Error(`product ${slug}: no name or no label for variant ${variantId}`);
  }
  return { name: product.name, label: variant.label };
}

/**
 * Cents as the store pages show them: `$25.00` (observed on every price 2026-11-07; the amounts are
 * the mentor's integer cents). A discount is shown with a Unicode minus: `−$5.00` (observed).
 */
export const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
export const usdDiscount = (cents: number): string => `−${usd(cents)}`;

/** One variant's current stock (product detail). */
export async function stockOf(client: ApiClient, slug: string, variantId: number): Promise<number> {
  const variant = variantsOf(await readProduct(client, slug)).find((item) => item.id === variantId);
  if (variant === undefined || typeof variant.stock !== 'number') {
    throw new Error(`product ${slug} has no variant ${variantId} with a stock number`);
  }
  return variant.stock;
}

/**
 * The error fields of a refused response (mentor 2026-11-07, item 6): `error` (code) and `message`
 * (text) for application errors, `messages` (array) for checkout validation and invalid cards, `code`
 * for Fastify schema failures. Missing fields are undefined, so a test asserts exactly the one it needs.
 */
export async function readError(
  response: APIResponse,
): Promise<{ error: unknown; message: unknown; messages: unknown; code: unknown }> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error(`expected a JSON object body (status ${response.status()})`);
  return { error: body.error, message: body.message, messages: body.messages, code: body.code };
}

// ---------------------------------------------------------------------------------------------
// Checkout and mock payment inputs

/**
 * Checkout body for the test's own order: a reserved `.test` address (no real mailbox) carrying the
 * owned name, and clearly synthetic shipping (accepted by the mentor 2026-11-07, item 9).
 */
export function checkoutInput(name: string): Json {
  return { ...shippingFor(name) };
}

export interface ShippingInput {
  email: string;
  ship_name: string;
  ship_address1: string;
  ship_city: string;
  ship_country: string;
  ship_postal: string;
}

/** The same synthetic values as `checkoutInput`, typed for the browser checkout form. */
export function shippingFor(name: string): ShippingInput {
  return {
    email: `${name}@example.test`,
    ship_name: name,
    ship_address1: 'qa-auto placeholder street 1',
    ship_city: 'qa-auto placeholder city',
    ship_country: 'qa-auto placeholder country',
    ship_postal: '00000',
  };
}

/** The pay operation's documented test cards (OAS pay description). Never a real card. */
export const MOCK_CARDS = {
  approved: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  gatewayError: '4000 0000 0000 0119',
} as const;

/** The OAS pay body examples for `exp` and `cvv`. */
export const MOCK_EXP = '12/30';
export const MOCK_CVV = '123';

/** A synthetic Luhn-valid 16-digit number outside the documented list (TC-SAPI-053). */
export function undocumentedLuhnCard(): string {
  const body = '400000000000003';
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let digit = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const digits = `${body}${(10 - (sum % 10)) % 10}`;
  const spaced = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  if ((Object.values(MOCK_CARDS) as string[]).includes(spaced)) {
    throw new Error('synthetic card collides with a documented test card');
  }
  return spaced;
}

/** The record that carries `order_number` (SCRUM-83), at the top or one level down. */
export function readOrder(body: unknown): Json {
  if (isRecord(body)) {
    if (typeof body.order_number === 'string') return body;
    const nested = Object.values(body).filter(
      (value): value is Json => isRecord(value) && typeof value.order_number === 'string',
    );
    if (nested.length === 1) return nested[0];
  }
  throw new Error('no order record with an order_number in the response');
}

/**
 * `GET /api/orders/{id}` for an own order: `{ order, items, payment }` (mentor 2026-11-07, item 10).
 * `payment` is null when no payment row exists.
 */
export async function readOrderById(
  client: ApiClient,
  orderId: number,
): Promise<{ order: Json; items: Json[]; payment: Json | null }> {
  const response = await client.get(`/api/orders/${orderId}`);
  if (response.status() !== 200) {
    throw new Error(`order ${orderId} read returned ${response.status()}`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.order) || !Array.isArray(body.items)) {
    throw new Error(`order ${orderId} read: expected { order, items, payment }`);
  }
  const payment = isRecord(body.payment) ? body.payment : null;
  return { order: body.order, items: body.items.filter(isRecord), payment };
}

// ---------------------------------------------------------------------------------------------
// The test's own guest cart

export interface CartView {
  cart: Json;
  lines: Json[];
}

/** The owned part of a cart: lines, money and coupon; shared `stock` is left out on purpose. */
export interface CartSnapshot {
  lines: { id: unknown; variant_id: unknown; qty: unknown }[];
  subtotal: unknown;
  discount: unknown;
  total: unknown;
  coupon: unknown;
}

let checkoutsThisProcess = 0;

/**
 * One fresh guest context and its server-issued cart. Line ids are registered as soon as a read
 * sees them, before any assertion, so teardown removes exactly these lines and nothing else.
 */
export class OwnedCart {
  readonly client: APIRequestContext;
  readonly #fields: CartFieldNames;
  readonly #records: OwnedRecords;
  readonly #testInfo: TestInfo;
  #couponApplied = false;
  #ordered = false;
  #cartId: number | undefined;

  constructor(
    client: APIRequestContext,
    fields: CartFieldNames,
    records: OwnedRecords,
    testInfo: TestInfo,
  ) {
    this.client = client;
    this.#fields = fields;
    this.#records = records;
    this.#testInfo = testInfo;
  }

  /** True once an approved payment closed this cart as `ordered` (mentor 2026-11-07, item 2). */
  get ordered(): boolean {
    return this.#ordered;
  }

  /**
   * Decides from Place order's own response, before any assertion (TC-SUI-031): an approved browser
   * checkout answers with a redirect to `/orders/{id}` (mentor 2026-11-12), which closes this cart as
   * `ordered`, so teardown leaves it as it is (mentor 2026-11-07, item 2). Returns that order id, or
   * undefined when the response is no such redirect (the cart then stays open and is cleaned).
   */
  markOrderedFromRedirect(
    response: Pick<Response, 'status' | 'headers' | 'url'>,
  ): number | undefined {
    const status = response.status();
    const location = response.headers().location;
    if (status < 300 || status >= 400 || location === undefined) return undefined;
    const match = /^\/orders\/(\d+)$/.exec(new URL(location, response.url()).pathname);
    if (match === null) return undefined;
    this.#ordered = true;
    this.#testInfo.annotations.push({
      type: 'retained',
      description: `order ${match[1]} (approved browser checkout; stays on dev, mentor 2026-11-12)`,
    });
    return Number(match[1]);
  }

  /** The id of the cart this test owns, captured on its first read. */
  get cartId(): number | undefined {
    return this.#cartId;
  }

  /**
   * `GET /api/cart` → `{ cart: {...} }` with `cart.items` (mentor 2026-11-07, item 3). It creates the
   * cart on first use (SCRUM-67), so it is a guarded write. Every new cart id is recorded as a retained
   * empty guest-cart row (item 2).
   */
  async read(): Promise<CartView> {
    const response = await envGuard(() => this.client.get('/api/cart'));
    if (response.status() !== 200) throw new Error(`own cart read returned ${response.status()}`);
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.cart) || !Array.isArray(body.cart.items)) {
      throw new Error('own cart read: expected { cart: { items: [...] } }');
    }
    const cart = body.cart;
    const lines = (cart.items as unknown[]).filter(isRecord);
    if (Number.isInteger(cart.id) && cart.id !== this.#cartId) {
      if (this.#cartId === undefined) this.#cartId = cart.id as number;
      this.#testInfo.annotations.push({
        type: 'retained',
        description: `own guest cart row ${String(cart.id)} (no cart delete API; mentor 2026-11-07 item 2)`,
      });
    }
    for (const line of lines) {
      const id = line[this.#fields.lineId];
      if (Number.isInteger(id) && !this.#records.registered.includes(id as number)) {
        this.#records.register(id as number);
      }
    }
    return { cart, lines };
  }

  /** `POST /api/cart/items {variant_id, qty}`, then a read that registers the new line. */
  async add(variantId: number, qty: number): Promise<APIResponse> {
    const response = await envGuard(() =>
      this.client.post('/api/cart/items', { data: { variant_id: variantId, qty } }),
    );
    await this.read();
    return response;
  }

  /** `PATCH /api/cart/items/{id} {qty}` (qty 0 removes the line, SCRUM-72). */
  async setQty(lineId: number, qty: number): Promise<APIResponse> {
    const response = await envGuard(() =>
      this.client.patch(`/api/cart/items/${lineId}`, { data: { qty } }),
    );
    await this.read();
    return response;
  }

  /** `DELETE /api/cart/items/{id}`. */
  removeLine(lineId: number): Promise<APIResponse> {
    return envGuard(() => this.client.delete(`/api/cart/items/${lineId}`));
  }

  /** `POST /api/cart/coupon {code}`; teardown clears it again. */
  applyCoupon(code: string): Promise<APIResponse> {
    this.#couponApplied = true;
    return envGuard(() => this.client.post('/api/cart/coupon', { data: { code } }));
  }

  /** `{"code":""}` clears the coupon (mentor item 2), whoever applied it; skipped on an ordered cart. */
  async clearCoupon(): Promise<void> {
    if (this.#ordered) return;
    const response = await envGuard(() =>
      this.client.post('/api/cart/coupon', { data: { code: '' } }),
    );
    if (!response.ok())
      throw new Error(`cleanup: clearing own coupon returned ${response.status()}`);
  }

  /** `{"code":""}` clears the coupon (mentor item 2). Skipped once an approved payment closed the cart. */
  async clearCouponIfApplied(): Promise<void> {
    if (!this.#couponApplied || this.#ordered) return;
    const response = await envGuard(() =>
      this.client.post('/api/cart/coupon', { data: { code: '' } }),
    );
    if (!response.ok())
      throw new Error(`cleanup: clearing own coupon returned ${response.status()}`);
  }

  /**
   * `POST /api/checkout` within the allocation's per-run budget (one worker). The order is retained:
   * no API deletes orders, so its id goes into the report as a retained record.
   */
  async checkout(input: Json): Promise<{ response: APIResponse; order: Json | undefined }> {
    const allocation = checkoutAllocation();
    if (checkoutsThisProcess >= allocation.maxCheckoutsPerRun) {
      throw new Error('checkout allocation for this run is used up; no further order is created');
    }
    checkoutsThisProcess += 1;
    const response = await envGuard(() => this.client.post('/api/checkout', { data: input }));
    if (!response.ok()) return { response, order: undefined };
    const order = readOrder(await response.json());
    this.#testInfo.annotations.push({
      type: 'retained',
      description: `order ${String(order.id)} under allocation ${allocation.source}`,
    });
    return { response, order };
  }

  /**
   * `POST /api/checkout/{orderId}/pay` with a documented test card, one attempt (mentor item 8). Only
   * an approved payment (200) closes the cart as `ordered`; after a decline, a gateway error or a
   * rejected card the cart stays open and teardown cleans it (item 2).
   */
  async pay(orderId: number, cardNumber: string): Promise<APIResponse> {
    const response = await envGuard(() =>
      this.client.post(`/api/checkout/${orderId}/pay`, {
        data: { card_number: cardNumber, exp: MOCK_EXP, cvv: MOCK_CVV },
      }),
    );
    if (response.status() === 200) this.#ordered = true;
    return response;
  }

  lineId(line: Json): number {
    const id = line[this.#fields.lineId];
    if (!Number.isInteger(id)) throw new Error(`cart line has no integer ${this.#fields.lineId}`);
    return id as number;
  }

  /** `subtotal_cents` (SCRUM-68); discount and total from the cart fields (mentor item 3). */
  subtotal(view: CartView): unknown {
    return view.cart.subtotal_cents;
  }

  discount(view: CartView): unknown {
    return view.cart[this.#fields.discount];
  }

  total(view: CartView): unknown {
    return view.cart[this.#fields.total];
  }

  snapshot(view: CartView): CartSnapshot {
    return {
      lines: view.lines.map((line) => ({
        id: line[this.#fields.lineId],
        variant_id: line.variant_id,
        qty: line.qty,
      })),
      subtotal: this.subtotal(view),
      discount: this.discount(view),
      total: this.total(view),
      coupon: view.cart.coupon_code,
    };
  }
}

/** Removes one own line; a 404 means the test already removed it. */
async function removeOwnLine(cart: OwnedCart, lineId: number): Promise<void> {
  if (cart.ordered) return; // an approved payment closed the cart; it stays as ordered (item 2)
  await apiTest.step(`delete own cart line ${lineId}`, async () => {
    const response = await cart.removeLine(lineId);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`cleanup: deleting own cart line ${lineId} returned ${response.status()}`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Fixtures

interface StoreFixtures {
  ownedCart: OwnedCart;
  pageCart: OwnedCart;
}

/**
 * The shared body of both cart fixtures. Gates first (the case's own, then the two cart gates),
 * before any request; then the cart client. Teardown removes the registered lines, clears the coupon
 * and checks the cart is empty; the empty cart row itself stays (mentor 2026-11-07, item 2). Runs
 * after a failed test too. `browserWrites`: the browser may add lines or apply coupons the helper did
 * not see, so teardown first reads the cart (registering every line) and always clears the coupon
 * through the API, because the UI's empty code does not clear it (observed 2026-11-07).
 */
async function runOwnedCart(
  client: () => Promise<APIRequestContext>,
  testInfo: TestInfo,
  use: (cart: OwnedCart) => Promise<void>,
  browserWrites: boolean,
): Promise<void> {
  requireCaseGates(testInfo);
  requireGate(testInfo, 'cartRowMayRemain');
  requireGate(testInfo, 'cartFields');
  const fields = openValue(STORE_GATES.cartFields, 'cartFields');
  const request = await client();
  const owned: { cart?: OwnedCart } = {};
  await withOwnedRecords(
    async (lineId) => {
      if (owned.cart !== undefined) await removeOwnLine(owned.cart, lineId);
    },
    async (records) => {
      const cart = new OwnedCart(request, fields, records, testInfo);
      owned.cart = cart;
      try {
        await use(cart);
      } finally {
        if (browserWrites && !cart.ordered) {
          await cart.read();
          await cart.clearCoupon();
        } else {
          await cart.clearCouponIfApplied();
        }
      }
    },
  );
  if (owned.cart !== undefined && !owned.cart.ordered) {
    const after = await owned.cart.read();
    if (after.lines.length > 0) throw new Error('cleanup: own cart still holds lines');
  }
}

export const test = apiTest.extend<StoreFixtures>({
  // A fresh guest context of its own (API tests).
  ownedCart: async ({ newApi }, use, testInfo) => {
    await runOwnedCart(() => newApi(), testInfo, use, false);
  },

  // The browser page's own request context: same cookies, so the API helper and the page share one
  // guest cart (browser tests). Store UI journeys stay guest-only: a signed-in cart would be the shared
  // AUTHOR account's cart.
  pageCart: async ({ page }, use, testInfo) => {
    await runOwnedCart(async () => page.request, testInfo, use, true);
  },
});
