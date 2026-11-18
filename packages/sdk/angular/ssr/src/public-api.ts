/**
 * `@inth/angular/ssr`: server rendering for `@inth/angular`.
 *
 * Server-only: import it from `app.config.server.ts` and `server.ts`.
 *
 * - `provideC15tServer()` resolves the visitor's consent for each request
 *   and hands it to the browser through `TransferState`, so the first HTML
 *   carries the right banner and hydration matches.
 * - `createConsentRoute()` serves the consent backend routes (`/manifest`,
 *   `/init`, and with `proxy` the writes) from the Angular server, for
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
export { provideC15tServer } from './provide-c15t-server';
export type { C15tServerOptions } from './provide-c15t-server';
