/**
 * Screen-reader containment and initial focus for an open surface.
 *
 * React Native has no DOM focus stack, so a focus trap on device is three real
 * mechanisms rather than one abstraction: `accessibilityViewIsModal` keeps
 * VoiceOver and TalkBack inside the sheet, `setAccessibilityFocus` moves the
 * reader to it when it opens, and `BackHandler` gives Android an exit.
 * Android keeps an accessible container. On iOS the container must not group its
 * children, or VoiceOver and XCUITest cannot reach the consent controls inside it.
 *
 * A surface rendered inside `Modal` gets the back gesture from the platform
 * already, and subscribing here as well would close it twice, so those surfaces
 * pass `hardwareBack: false`.
 */

import { useEffect, useRef } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform } from 'react-native';
import type { Text, View } from 'react-native';

import { useHardwareBack } from './use-hardware-back';

/**
 * What a `View` ref actually holds.
 *
 * Derive it from the component so class-based and function-based React Native
 * View declarations both keep the correct native instance.
 */
export type SurfaceInstance = ComponentRef<typeof View>;

/** What {@link useModalA11y} hands a surface. */
export interface ModalA11y {
	/** Accessible heading to focus on iOS, where the container is ungrouped. */
	readonly headingRef: RefObject<ComponentRef<typeof Text> | null>;
	/** Ref to put on the sheet container. */
	readonly containerRef: RefObject<SurfaceInstance | null>;
	/** Accessibility props to spread on the sheet container. */
	readonly containerProps: {
		readonly accessible: boolean;
		readonly accessibilityViewIsModal: true;
		readonly collapsable: false;
	};
}

/**
 * Wire containment, initial focus, and the Android back gesture.
 *
 * @param options - Inputs.
 * @param options.active - Whether the surface is open.
 * @param options.hardwareBack - Whether to take the Android back gesture here.
 * @param options.onRequestClose - Called for a hardware back press.
 * @returns The container ref and its accessibility props.
 */
export const useModalA11y = function useModalA11y({
	active,
	hardwareBack = true,
	onRequestClose,
}: {
	readonly active: boolean;
	readonly hardwareBack?: boolean;
	readonly onRequestClose?: (() => void) | undefined;
}): ModalA11y {
	const containerRef = useRef<SurfaceInstance | null>(null);
	const headingRef = useRef<ComponentRef<typeof Text> | null>(null);

	useHardwareBack(active && hardwareBack, onRequestClose);

	useEffect(() => {
		if (!active) {
			return;
		}

		// The reader needs a frame to settle on the new subtree before a tag is
		// meaningful, and an unmounted sheet has no tag to move to.
		const frame = requestAnimationFrame(() => {
			const target =
				Platform.OS === 'ios' ? headingRef.current : containerRef.current;
			const tag = findNodeHandle(target);

			if (typeof tag === 'number') {
				AccessibilityInfo.setAccessibilityFocus(tag);
			}
		});

		return () => {
			cancelAnimationFrame(frame);
		};
	}, [active]);

	return {
		containerProps: {
			accessibilityViewIsModal: true,
			// Android drops an unlabelled container from the reader tree when it
			// is not explicitly accessible.
			accessible: Platform.OS !== 'ios',
			collapsable: false,
		},
		containerRef,
		headingRef,
	};
};

/** Whether the running platform needs a back-handler subscription at all. */
export const platformNeedsBackHandler =
	function platformNeedsBackHandler(): boolean {
		return Platform.OS === 'android';
	};
