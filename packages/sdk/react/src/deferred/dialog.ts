/**
 * The stock dialog for a deferred root that opens it before the engine:
 * the wrapper and the parts it would load lazily, in one chunk group, so
 * opening it costs one round trip rather than two. The embedded
 * `ConsentWidget` stays out: the dialog never renders it.
 *
 * @packageDocumentation
 * @internal
 */

/* oxlint-disable oxc/no-barrel-file -- The early dialog's chunk. */
export { ConsentDialog } from '../aggregate-components';
export * as dialog from '../components/dialog/consent-dialog-body';
