// Probe: node safety/probes/run-if-env.probe.ts
// Calls runIfEnv with an in-memory stand-in for Playwright's test.skip and records each call.
import { runIfEnv, type SkipTest } from '../../env/runIfEnv.ts';
import type { AppEnv } from '../../env/target.ts';
import { describeError, emit } from './probe-output.ts';

function record(allowed: readonly [AppEnv, ...AppEnv[]]) {
  const calls: { condition: boolean; description: string }[] = [];
  const fakeTest: SkipTest = {
    skip: (condition, description) => {
      calls.push({ condition, description });
    },
  };
  runIfEnv(fakeTest, allowed);
  return calls;
}

try {
  emit({
    ok: true,
    devOnly: record(['dev']),
    prodOnly: record(['prod']),
    devAndProd: record(['dev', 'prod']),
  });
} catch (error) {
  emit({ ok: false, error: describeError(error) });
  process.exitCode = 1;
}
