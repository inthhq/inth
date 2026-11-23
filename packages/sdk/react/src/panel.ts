'use client';

/**
 * `@inth/react/consent-dialog`: the deferred `ConsentDialog`, the same
 * component the `@inth/react` entry exports. Its implementation and styles
 * load when the dialog first opens, or earlier when something preloads it,
 * so importing this entry adds nothing heavy to the first load.
 *
 * @packageDocumentation
 */

export { ConsentDialog } from './aggregate-components';
export type { ConsentDialogProps } from './components/dialog/types';
