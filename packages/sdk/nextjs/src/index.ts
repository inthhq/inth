/**
 * `@inth/nextjs` Next.js adapter.
 *
 * Pattern:
 *   // inth.config.ts, found by withConsentManifest in next.config.ts
 *   import { defineConsentConfig } from '@inth/nextjs';
 *   export default defineConsentConfig({ scripts: [...] });
 *
 *   // app/layout.tsx (Server Component)
 *   import { ConsentBanner, InthProvider } from '@inth/nextjs';
 *   import { resolveConsent } from '@inth/nextjs/server';
 *
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html>
 *         <body>
 *           <InthProvider state={resolveConsent()}>
 *             {children}
 *             <ConsentBanner />
 *           </InthProvider>
 *         </body>
 *       </html>
 *     );
 *   }
 *
 *   // any client component
 *   import { useConsent } from '@inth/react';
 *   const allowed = useConsent('marketing');
 *
 * Server helpers return serializable data and avoid module-level runtime
 * caches, keeping requests isolated under Fluid Compute. A Server Component
 * resolves this entry through the `react-server` condition to
 * `index.react-server.ts`.
 */

// oxlint-disable-next-line oxc/no-barrel-file -- Preserve declaration order, interface shape, and public compatibility.
export * from '@inth/react';
// Their code loads with the deferred root's engine; see `./root`.
export {
	DeferredConsentBanner as ConsentBanner,
	DeferredConsentDialog as ConsentDialog,
	DeferredOptOutConfirmation as OptOutConfirmation,
} from '@inth/react/deferred';
export type { InthProviderProps } from './root';
export { InthProvider } from './root';
export type {
	ConsentClientOptions,
	ConsentState,
	InthProviderOptions,
} from './types';
export type { ConsentConfig } from './config';
export { defineConsentConfig } from './config';
// The data factories, in place of `@inth/react`'s transports.
export type {
	ConsentMode,
	HostedMode,
	ManifestMode,
	ManifestModeOptions,
	TestingMode,
} from '@inth/sdk/modes';
export { hosted, manifest } from '@inth/sdk/modes';
