/**
 * The project URL rule for the mobile SDKs, which work only with the Inth
 * hosted service.
 *
 * `packages/native-protocol/project-url/cases.json` is the shared fixture. Swift and
 * Kotlin apply the same steps in the same order.
 *
 * This file exists twice, byte for byte: in
 * `packages/react-native/src/expo-plugin/project-url.ts` and in
 * `packages/cli/vendor/c15t-mobile/src/mobile/project-url.ts`. The Expo plugin ships without
 * runtime dependencies on other c15t packages and the CLI cannot depend on the
 * React Native package, so neither can import the other. The CLI test
 * `src/__tests__/mobile/project-url.test.ts` fails when the copies differ.
 */

/** A project host is one or more labels in front of one of these. */
export const INTH_PROJECT_HOST_SUFFIXES = ['inth.app'] as const;

/** Why a URL was refused, in the fixture's `reasons` codes. */
export type ProjectURLReason =
	| 'empty'
	| 'malformed'
	| 'scheme'
	| 'credentials'
	| 'host'
	| 'port'
	| 'path'
	| 'query';

/** Options for {@link normalizeProjectURL}. */
export interface ProjectURLOptions {
	/**
	 * The rule for a `dryRun` build: any `https` URL, or `http` on `localhost`,
	 * `127.0.0.1` or `[::1]`, with a port and a path allowed.
	 *
	 * @defaultValue false
	 */
	relaxed?: boolean;
	/**
	 * The option name the message starts with.
	 *
	 * @defaultValue 'backendURL'
	 */
	option?: string;
}

const EXAMPLE = 'https://your-project.inth.app';

const escapePattern = (value: string): string =>
	value.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&');

const PROJECT_HOST = new RegExp(
	`^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+(${INTH_PROJECT_HOST_SUFFIXES.map(escapePattern).join('|')})$`,
	'u'
);

const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

const DETAILS: Record<ProjectURLReason, string> = {
	credentials: 'it must not carry a username or password',
	empty: 'the value is empty',
	host: `the host must be a project host under ${INTH_PROJECT_HOST_SUFFIXES.join(' or ')}`,
	malformed: 'it does not parse as a URL',
	path: 'it must not have a path',
	port: 'it must not name a port',
	query: 'it must not have a query or a fragment',
	scheme: 'the scheme must be https',
};

/** A host name or a bracketed IPv6 literal, the shapes the relaxed rule takes. */
const PLAUSIBLE_HOST = /^(?:\[[0-9a-f:.]+\]|[a-z0-9.-]+)$/u;

const RELAXED_SCHEME_DETAIL =
	'the scheme must be https, or http on localhost, 127.0.0.1 or [::1]';

/** A `backendURL` that is not an Inth project URL. */
export class ProjectURLError extends Error {
	/** The code from `packages/native-protocol/project-url/cases.json`. */
	readonly reason: ProjectURLReason;
	/** The value as it was given. */
	readonly input: string;

	/**
	 * @param reason - The fixture's reason code.
	 * @param input - The value as it was given.
	 * @param options - The rule that refused it and the option name to print.
	 */
	constructor(
		reason: ProjectURLReason,
		input: string,
		options: ProjectURLOptions = {}
	) {
		const detail =
			reason === 'scheme' && options.relaxed === true
				? RELAXED_SCHEME_DETAIL
				: DETAILS[reason];
		super(
			`${options.option ?? 'backendURL'} must be the project URL from your ` +
				`Inth dashboard, such as ${EXAMPLE}. Got "${input}": ` +
				`${detail}.`
		);
		this.name = 'ProjectURLError';
		this.reason = reason;
		this.input = input;
	}
}

/** Host and port of `host`, `host:port` or `[v6]:port`, or `null`. */
const splitPort = (
	hostPort: string
): { host: string; port: string | null } | null => {
	let host = hostPort;
	let after = '';
	if (hostPort.startsWith('[')) {
		const close = hostPort.indexOf(']');
		if (close === -1) {
			return null;
		}
		host = hostPort.slice(0, close + 1);
		after = hostPort.slice(close + 1);
	} else {
		const colon = hostPort.indexOf(':');
		if (colon !== -1) {
			host = hostPort.slice(0, colon);
			after = hostPort.slice(colon);
		}
	}
	if (after === '') {
		return { host, port: null };
	}
	const port = after.slice(1);
	return after.startsWith(':') &&
		/^[0-9]+$/u.test(port) &&
		Number(port) <= 65_535
		? { host, port }
		: null;
};

/** The parts of a URL the rule looks at, as written apart from case. */
interface ProjectURLParts {
	readonly scheme: string;
	readonly host: string;
	readonly port: string | null;
	/** Without trailing slashes. */
	readonly path: string;
	readonly hasCredentials: boolean;
	readonly hasQuery: boolean;
}

/** Split `scheme://authority/path?query`, or `null` when no host can be read. */
const splitURL = (url: string): ProjectURLParts | null => {
	const separator = url.indexOf('://');
	const rest = url.slice(separator + 3);
	const authorityEnd = rest.search(/[#/?]/u);
	const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
	const tail = authorityEnd === -1 ? '' : rest.slice(authorityEnd);
	const hostPort = splitPort(authority.slice(authority.lastIndexOf('@') + 1));
	if (hostPort === null || hostPort.host === '') {
		return null;
	}
	const pathEnd = tail.search(/[#?]/u);
	return {
		hasCredentials: authority.includes('@'),
		hasQuery: pathEnd !== -1,
		host: hostPort.host.toLowerCase(),
		path: (pathEnd === -1 ? tail : tail.slice(0, pathEnd)).replace(/\/+$/u, ''),
		port: hostPort.port,
		scheme: url.slice(0, separator).toLowerCase(),
	};
};

/** What only the strict rule refuses: the host, a port and a path, in that order. */
const strictProblem = (parts: ProjectURLParts): ProjectURLReason | null => {
	if (!PROJECT_HOST.test(parts.host)) {
		return 'host';
	}
	if (parts.port !== null) {
		return 'port';
	}
	return parts.path === '' ? null : 'path';
};

/** The first reason to refuse a trimmed, non-empty value, or its parts. */
const inspectURL = (
	value: string,
	relaxed: boolean
): ProjectURLParts | ProjectURLReason => {
	if (/\s/u.test(value)) {
		return 'malformed';
	}
	const url = value.includes('://') ? value : `https://${value}`;
	const scheme = url.slice(0, url.indexOf('://')).toLowerCase();
	if (scheme !== 'https' && !(relaxed && scheme === 'http')) {
		return 'scheme';
	}
	const parts = splitURL(url);
	if (parts === null) {
		return 'malformed';
	}
	if (relaxed && !PLAUSIBLE_HOST.test(parts.host)) {
		return 'malformed';
	}
	if (scheme === 'http' && !LOOPBACK_HOSTS.includes(parts.host)) {
		return 'scheme';
	}
	if (parts.hasCredentials) {
		return 'credentials';
	}
	const strict = relaxed ? null : strictProblem(parts);
	if (strict !== null) {
		return strict;
	}
	return parts.hasQuery ? 'query' : parts;
};

/**
 * Check a project URL and return its normal form.
 *
 * The strict rule takes `https://<project>.<suffix>` with no port, path, query
 * or credentials, and returns `https://<lowercased host>`. A value without a
 * scheme gets `https://`.
 *
 * @param input - The value as the developer wrote it.
 * @param options - `relaxed` for a `dryRun` build, and the option name to print.
 * @returns The normal form, without a trailing slash.
 * @throws {ProjectURLError} When the value is refused. `reason` carries the code.
 */
export const normalizeProjectURL = (
	input: string,
	options: ProjectURLOptions = {}
): string => {
	const value = input.trim();
	const found =
		value === '' ? 'empty' : inspectURL(value, options.relaxed === true);
	if (typeof found === 'string') {
		throw new ProjectURLError(found, input, options);
	}
	const port = found.port === null ? '' : `:${found.port}`;
	const normalized = `${found.scheme}://${found.host}${port}${found.path}`;
	// The relaxed rule takes hosts and paths the checks above do not vet.
	try {
		void new URL(normalized);
	} catch {
		throw new ProjectURLError('malformed', input, options);
	}
	return normalized;
};
