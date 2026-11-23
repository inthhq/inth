import type { ProjectUrlReason } from './project-url';

/**
 * The single error type the plugin raises.
 *
 * Every message here names the prop or file to change, because the alternative
 * is a prebuild that fails inside a plist writer with no idea that Inth asked
 * for it.
 */
export class InthPluginError extends Error {
	/**
	 * Why `projectUrl` was refused, in the reason codes of
	 * `packages/native-protocol/project-url/cases.json`. Unset for every other error.
	 */
	readonly reason?: ProjectUrlReason;

	/**
	 * @param message - Actionable detail, without the package prefix.
	 * @param reason - The project URL reason code, for a refused `projectUrl`.
	 * @param options - The underlying error, as `cause`.
	 */
	constructor(
		message: string,
		reason?: ProjectUrlReason,
		options?: ErrorOptions
	) {
		super(`@inth/react-native config plugin: ${message}`, options);
		this.name = 'InthPluginError';
		this.reason = reason;
	}
}
