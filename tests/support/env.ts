// Compatibility wrapper: test utilities read the target here, never from playwright.config.ts.
import { getTarget } from '../../env/target.ts';

export { currentEnv } from '../../env/target.ts';

export const baseURL = getTarget().baseURL;
