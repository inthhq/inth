import type { ConsentRuntimeOptions } from '../runtime/consent-runtime.model';

/**
 * The storage `persistence` resolves to, from one option set. Its own
 * module, so first-load code can read it without the runtime.
 *
 * @internal
 */
export const storageFor = function storageFor(
	options: Pick<
		ConsentRuntimeOptions,
		'consentSource' | 'persistence' | 'storageConfig'
	>
): ConsentRuntimeOptions['storageConfig'] {
	return (
		(!options.consentSource && typeof options.persistence === 'object'
			? options.persistence.storageConfig
			: undefined) ?? options.storageConfig
	);
};
