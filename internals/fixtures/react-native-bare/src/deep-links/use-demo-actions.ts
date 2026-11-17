/**
 * Collect the consent commands the demo verbs call into one stable object.
 */

import {
	useConsentActions,
	useDismissNotice,
	useIdentify,
	useSaveConsents,
	useSetOverrides,
} from '@c15t/react-native';
import { useMemo } from 'react';

import type { DemoActions } from './verbs';

/**
 * The commands a demo link can run.
 *
 * @returns One object that changes only when the provider's client does.
 */
export const useDemoActions = function useDemoActions(): DemoActions {
	const actions = useConsentActions();
	const dismissNotice = useDismissNotice();
	const identify = useIdentify();
	const saveConsents = useSaveConsents();
	const setOverrides = useSetOverrides();

	return useMemo(
		() => ({
			...actions,
			dismissNotice,
			identify,
			saveConsents,
			setOverrides,
		}),
		[actions, dismissNotice, identify, saveConsents, setOverrides]
	);
};
