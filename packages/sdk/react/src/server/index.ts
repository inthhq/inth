/**
 * Server-side utilities for SSR data fetching.
 *
 * @remarks
 * This module provides framework-agnostic SSR utilities for fetching
 * consent data on the server. It works with any framework that provides
 * access to standard Web API Headers.
 *
 * Framework-specific packages (like @inth/nextjs) wrap these utilities
 * with their own header resolution logic.
 *
 * @example
 * ```ts
 * // Direct usage in any framework
 * import { fetchSSRData } from '@inth/react/server';
 *
 * // In your server handler
 * const data = await fetchSSRData({
 *   projectUrl: '/api/consent',
 *   headers: request.headers,
 *   debug: true
 * });
 * ```
 *
 * @packageDocumentation
 */

export { fetchSSRData } from './fetch-ssr-data';
export type {
	FetchSSRDataOptions,
	FetchSSRDataOptionsBase,
	FetchSSRDataResult,
} from './types';
