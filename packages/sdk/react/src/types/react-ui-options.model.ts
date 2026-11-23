import type { UIOptions } from '@inth/sdk/ui/theme';

import type { ReactComponentSlots } from './react-slots.model';

/**
 * React-specific UI configuration options.
 *
 * @remarks
 * Extends the framework-agnostic {@link UIOptions} with per-component slot
 * overrides. `InthProvider` picks its theme-related options from here.
 *
 * @public
 */
export interface ReactUIOptions extends UIOptions {
	/** Per-component slot attribute overrides (shared contract with @inth/vue). */
	components?: ReactComponentSlots;
}
