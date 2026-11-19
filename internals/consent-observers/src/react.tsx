import { KernelContext } from '@inth/react/context';
/**
 * A React consumer that finds the kernel through `KernelContext` from
 * `@inth/react/context`, the way a component library built on top of Inth
 * would, and subscribes with `useSyncExternalStore`.
 */
import type { AllConsentNames, ConsentSnapshot } from '@inth/sdk/engine';
import { useCallback, useContext, useSyncExternalStore } from 'react';

const detached = function detached(): void {
	// Nothing to unsubscribe from without a provider.
};

/**
 * Reads the nearest provider's snapshot.
 *
 * @returns The snapshot, or `null` when no provider is above the caller.
 */
export const useObservedSnapshot =
	function useObservedSnapshot(): ConsentSnapshot | null {
		const kernel = useContext(KernelContext);
		const subscribe = useCallback(
			(onChange: () => void) =>
				kernel ? kernel.subscribe(onChange) : detached,
			[kernel]
		);
		return useSyncExternalStore(
			subscribe,
			() => kernel?.getSnapshot() ?? null,
			() => kernel?.getServerSnapshot() ?? null
		);
	};

export interface ConsentProbeProps {
	/** Identifies the probe in the DOM. */
	name: string;
	/** Category to report. Defaults to `marketing`. */
	category?: AllConsentNames;
	/** Called on every render with the snapshot the probe rendered. */
	onRender?: (snapshot: ConsentSnapshot | null) => void;
}

/**
 * Renders what one consumer sees as data attributes, so tests can read it
 * from the DOM or from server HTML.
 */
export const ConsentProbe = ({
	name,
	category = 'marketing',
	onRender,
}: ConsentProbeProps) => {
	const snapshot = useObservedSnapshot();
	onRender?.(snapshot);
	return (
		<output
			data-probe={name}
			data-attached={snapshot ? 'yes' : 'no'}
			data-granted={String(snapshot?.effectivePermissions[category] ?? false)}
			data-revision={snapshot ? String(snapshot.revision) : ''}
		/>
	);
};
