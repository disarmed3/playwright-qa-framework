// Probe: node safety/probes/env-guard.probe.ts
// Passes in-memory dummy actions (counters only) through envGuard and reports what happened.
import { envGuard } from '../../env/envGuard.ts';
import { currentEnv } from '../../env/target.ts';
import { describeError, emit } from './probe-output.ts';

let calls = 0;
let asyncCalls = 0;
const dummyAction = () => {
  calls += 1;
  return 'changed';
};
const asyncDummyAction = async () => {
  asyncCalls += 1;
  return 'changed';
};

function attempt(run: () => unknown) {
  try {
    return { blocked: false, result: run(), error: null };
  } catch (error) {
    return { blocked: true, result: null, error: describeError(error) };
  }
}

try {
  const env = currentEnv();
  const sync = attempt(() => envGuard(dummyAction));
  const async = attempt(() => {
    void envGuard(asyncDummyAction);
    return 'started';
  });
  emit({ ok: true, env, sync, async, calls, asyncCalls });
} catch (error) {
  emit({ ok: false, error: describeError(error) });
  process.exitCode = 1;
}
