import { InthPluginError } from './inth-plugin-error';

/** Explicit repository for the versioned Android core and platform binaries. */
export interface InthAndroidMavenRepository {
	/** HTTPS repository URL, or an absolute file URL for local staging only. No credentials, query or fragment. */
	readonly url: string;
	/** Environment variable names, read by Gradle. Never supply credential values here. */
	readonly credentials?: {
		/** Environment variable containing the Maven username. */
		readonly usernameEnvironmentVariable: string;
		/** Environment variable containing the Maven password or read token. */
		readonly passwordEnvironmentVariable: string;
	};
}

/**
 * Validate build configuration without reading or reporting any credentials.
 * @param repository - Explicit repository configuration, if supplied.
 * @returns Validated configuration with a normalized URL, or null.
 * @throws {InthPluginError} For unsafe URLs or credential values instead of variable names.
 */
export const resolveAndroidMavenRepository =
	function resolveAndroidMavenRepository(
		repository: InthAndroidMavenRepository | undefined
	): InthAndroidMavenRepository | null {
		if (repository === undefined) {
			return null;
		}
		let url: URL;
		try {
			if (
				typeof repository.url !== 'string' ||
				/[\s\\]/u.test(repository.url)
			) {
				throw new Error('Invalid URL');
			}
			url = new URL(repository.url);
		} catch {
			throw new InthPluginError(
				'androidMavenRepository.url must be an HTTPS repository URL or an absolute file URL for local staging.'
			);
		}
		if (
			!['https:', 'file:'].includes(url.protocol) ||
			(url.protocol === 'file:' &&
				(url.hostname !== '' || !url.pathname.startsWith('/'))) ||
			url.username !== '' ||
			url.password !== '' ||
			url.search !== '' ||
			url.hash !== ''
		) {
			throw new InthPluginError(
				'androidMavenRepository.url must use HTTPS, or a local file URL, without credentials, a query or a fragment.'
			);
		}
		const { credentials } = repository;
		if (credentials !== undefined) {
			const names = [
				'usernameEnvironmentVariable',
				'passwordEnvironmentVariable',
			];
			if (
				url.protocol !== 'https:' ||
				credentials === null ||
				Object.keys(credentials).some((key) => !names.includes(key)) ||
				![
					credentials.usernameEnvironmentVariable,
					credentials.passwordEnvironmentVariable,
				].every(
					(name) =>
						typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)
				)
			) {
				throw new InthPluginError(
					'androidMavenRepository.credentials requires usernameEnvironmentVariable and passwordEnvironmentVariable environment variable names for an HTTPS repository. Credential literals are not accepted.'
				);
			}
		}
		if (credentials === undefined) {
			return { url: url.href };
		}
		return { credentials, url: url.href };
	};
