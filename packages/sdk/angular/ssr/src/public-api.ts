/**
 * `@inth/angular/ssr`: server rendering for `@inth/angular`.
 *
 * Server-only: import it from `app.config.server.ts` and `server.ts`.
 *
 * - `provideInthServer()` resolves the visitor's consent for each request
 *   and hands it to the browser through `TransferState`, so the first HTML
 *   carries the right banner and hydration matches.
 * - `createConsentRoute()` serves the consent backend routes (`/v1/consent/manifest`,
 *   `/v1/consent/init`, and with `proxy` the writes) from the Angular server, for
 *   `AngularNodeAppEngine` (Express, `node:http`) and fetch-style
 *   `AngularAppEngine` handlers.
 *
 * @packageDocumentation
 */
export { createConsentRoute } from './consent-route';
export type {
	ConsentProxyOptions,
	ConsentRoute,
	ConsentRouteOptions,
	NodeMiddleware,
	NodeRequest,
	NodeResponse,
} from './consent-route';
export { provideInthServer } from './provide-inth-server';
export type { InthServerOptions } from './provide-inth-server';
