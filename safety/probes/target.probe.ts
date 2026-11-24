// Probe: node safety/probes/target.probe.ts
// Reports this process's pinned target, then proves a later APP_ENV change is refused.
import { currentEnv, getTarget } from '../../env/target.ts';
import { describeError, emit } from './probe-output.ts';

try {
  const target = getTarget();
  const env = currentEnv();

  const original = process.env.APP_ENV;
  let pinRefusal = null;
  process.env.APP_ENV = target.env === 'dev' ? 'prod' : 'dev';
  try {
    getTarget();
  } catch (error) {
    pinRefusal = describeError(error);
  } finally {
    if (original === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = original;
  }

  emit({ ok: true, target: { ...target }, currentEnv: env, pinRefusal });
} catch (error) {
  emit({ ok: false, error: describeError(error) });
  process.exitCode = 1;
}
