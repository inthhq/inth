// oxlint-disable oxc/no-barrel-file -- Public preferences entrypoint preserves supported named exports.
'use client';

/**
 * `@inth/react/consent-widget`: the deferred `ConsentWidget`, the same
 * component the `@inth/react` entry exports. Its implementation and styles
 * load when the widget first renders.
 *
 * The eager widget and its individual parts (`Accordion`, `Switch`, `Footer`,
 * ...) are in `@inth/react/components/consent-widget`.
 *
 * @packageDocumentation
 */

export { ConsentWidget } from './aggregate-components';
export type {
	ConsentWidgetCompoundComponent,
	ConsentWidgetProps,
} from './components/preferences';
