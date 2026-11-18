import type { Overrides } from '../options/overrides';
import type { SSRInitRequestContext } from '../options/ssr';
import { hasGlobalPrivacyControlSignal } from './global-privacy-control';
import { DEFAULT_INIT_CREDENTIALS } from './request-context-headers';

const ABSOLUTE_URL_REGEX = /^https?:\/\//u;

const trimTrailingSlash = function trimTrailingSlash(value: string): string {
	if (value === '/') {
		return value;
	}

	return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeAbsoluteURL = function normalizeAbsoluteURL(url: URL): string {
	const normalized = url.toString();
	return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};

export const canonicalizeBrowserProjectUrl =
	function canonicalizeBrowserProjectUrl(
		projectUrl: string
	): string | undefined {
		try {
			const normalizedProjectUrl = trimTrailingSlash(projectUrl);
			if (ABSOLUTE_URL_REGEX.test(normalizedProjectUrl)) {
				return normalizeAbsoluteURL(new URL(normalizedProjectUrl));
			}

			if (!normalizedProjectUrl.startsWith('/')) {
				return undefined;
			}

			return normalizeAbsoluteURL(
				new URL(normalizedProjectUrl, window.location.origin)
			);
		} catch {
			return undefined;
		}
	};

export interface RuntimeRequestContextMatcher {
	projectUrl: string;
	country?: string;
	region?: string;
	language?: string;
	gpc: boolean;
	credentials: RequestCredentials;
}

export const createBrowserRequestContext =
	function createBrowserRequestContext(options: {
		projectUrl: string;
		overrides?: Pick<Overrides, 'country' | 'region' | 'language'>;
		credentials?: RequestCredentials;
		gpc?: boolean;
	}): SSRInitRequestContext | undefined {
		const normalizedProjectUrl = canonicalizeBrowserProjectUrl(
			options.projectUrl
		);
		if (!normalizedProjectUrl) {
			return undefined;
		}
		const detectedGpc = hasGlobalPrivacyControlSignal();

		return {
			country: options.overrides?.country ?? null,
			credentials: options.credentials ?? DEFAULT_INIT_CREDENTIALS,
			gpc:
				options.gpc ?? (typeof detectedGpc === 'boolean' ? detectedGpc : false),
			language: options.overrides?.language ?? null,
			projectUrl: normalizedProjectUrl,
			region: options.overrides?.region ?? null,
		};
	};

export const createRuntimeRequestContextMatcher =
	function createRuntimeRequestContextMatcher(options: {
		projectUrl: string;
		overrides?: Overrides;
		credentials?: RequestCredentials;
	}): RuntimeRequestContextMatcher | undefined {
		const normalizedProjectUrl = canonicalizeBrowserProjectUrl(
			options.projectUrl
		);
		if (!normalizedProjectUrl) {
			return undefined;
		}
		const detectedGpc = hasGlobalPrivacyControlSignal();

		return {
			country: options.overrides?.country,
			credentials: options.credentials ?? DEFAULT_INIT_CREDENTIALS,
			gpc:
				options.overrides?.gpc ??
				(typeof detectedGpc === 'boolean' ? detectedGpc : false),
			language: options.overrides?.language,
			projectUrl: normalizedProjectUrl,
			region: options.overrides?.region,
		};
	};

export const matchesStoredRequestContext = function matchesStoredRequestContext(
	stored: SSRInitRequestContext,
	matcher: RuntimeRequestContextMatcher
): boolean {
	if (stored.projectUrl !== matcher.projectUrl) {
		return false;
	}

	if (stored.gpc !== matcher.gpc) {
		return false;
	}

	if (matcher.country !== undefined && stored.country !== matcher.country) {
		return false;
	}

	if (matcher.region !== undefined && stored.region !== matcher.region) {
		return false;
	}

	if (matcher.language !== undefined && stored.language !== matcher.language) {
		return false;
	}

	if (
		stored.credentials !== undefined &&
		stored.credentials !== matcher.credentials
	) {
		return false;
	}

	return true;
};
