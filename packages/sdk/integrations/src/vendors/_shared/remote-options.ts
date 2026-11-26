import type { RemoteEnumOption } from '../../remote-define';

/** `loadMode` for vendors that can load before a choice or wait for it. */
export const loadModeOption = {
	default: 'always',
	kind: 'enum',
	label: 'Load mode',
	values: ['always', 'after-consent'],
} as const satisfies RemoteEnumOption;
