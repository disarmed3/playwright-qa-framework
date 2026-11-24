// Probe: node safety/probes/api-helpers.probe.ts
// Loads tests/support/api.ts in this process's environment and passes an in-memory dummy client
// (counters only) through every write helper. No request leaves the process.
import type { ApiClient } from '../../tests/support/api.ts';
import { describeError, emit } from './probe-output.ts';

const calls = { get: 0, post: 0, patch: 0, delete: 0 };
const dummyResponse = { ok: () => false, status: () => 0 };
const count = (method: keyof typeof calls) => async () => {
  calls[method] += 1;
  return dummyResponse;
};
const dummyClient = {
  get: count('get'),
  post: count('post'),
  patch: count('patch'),
  delete: count('delete'),
} as unknown as ApiClient;

try {
  const api = await import('../../tests/support/api.ts');
  const owned = new api.OwnedArticles(dummyClient, new api.OwnedRecords());
  const writes: [string, () => Promise<unknown>][] = [
    ['createArticle', () => api.createArticle(dummyClient, { title: 't', body: 'b' })],
    ['updateArticle', () => api.updateArticle(dummyClient, 1, { title: 't' })],
    ['deleteArticle', () => api.deleteArticle(dummyClient, 1)],
    ['postComment', () => api.postComment(dummyClient, 1, { author_name: 'n', body: 'b' })],
    ['deleteComment', () => api.deleteComment(dummyClient, 1)],
    ['OwnedArticles.createAs', () => owned.createAs(dummyClient, { title: 't', body: 'b' })],
  ];
  const attempts: Record<string, { blocked: boolean; error: unknown }> = {};
  for (const [name, run] of writes) {
    try {
      await run();
      attempts[name] = { blocked: false, error: null };
    } catch (error) {
      attempts[name] = { blocked: true, error: describeError(error) };
    }
  }
  emit({ ok: true, attempts, calls });
} catch (error) {
  emit({ ok: false, error: describeError(error) });
  process.exitCode = 1;
}
