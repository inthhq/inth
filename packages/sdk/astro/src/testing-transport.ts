/**
 * The `testing()` transport, in its own module so the browser client loads
 * it with a dynamic import only when a test page inits.
 *
 * @internal
 */
export { createTestingMode } from '@c15t/core/testing';
