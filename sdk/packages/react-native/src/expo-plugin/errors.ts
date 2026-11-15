import type { ProjectURLReason } from './project-url';

/**
 * The single error type the plugin raises.
 *
 * Every message here names the prop or file to change, because the alternative
 * is a prebuild that fails inside a plist writer with no idea that c15t asked
 * for it.
 */
export class C15tPluginError extends Error {
	/**
	 * Why `backendURL` was refused, in the reason codes of
	 * `native/protocol/project-url/cases.json`. Unset for every other error.
	 */
	readonly reason?: ProjectURLReason;

	/**
	 * @param message - Actionable detail, without the package prefix.
	 * @param reason - The project URL reason code, for a refused `backendURL`.
	 * @param options - The underlying error, as `cause`.
	 */
	constructor(
		message: string,
		reason?: ProjectURLReason,
		options?: ErrorOptions
	) {
		super(`@c15t/react-native config plugin: ${message}`, options);
		this.name = 'C15tPluginError';
		this.reason = reason;
	}
}
