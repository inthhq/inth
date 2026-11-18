// #region docs:ssr-server-config title="src/app/app.config.server.ts"
import { mergeApplicationConfig } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideC15tServer } from '@inth/angular/ssr';

import { consentRoute } from '../consent.server';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
	providers: [
		provideServerRendering(withRoutes(serverRoutes)),
		// Resolves each visitor's consent before the render, through the
		// consent route in-process.
		provideC15tServer({ route: consentRoute }),
	],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
// #endregion docs:ssr-server-config
