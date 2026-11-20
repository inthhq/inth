/// <reference types="vite/client" />
/**
 * What a Server Component gets from `@inth/nextjs`: the `react-server` entry
 * names one `'use client'` module for the quickstart components, plus the
 * config helpers as plain functions.
 */
import { ConsentDialogLink } from '@inth/react/components/consent-dialog-link';
// The banner and dialog whose code loads with InthProvider's engine.
import {
	DeferredConsentBanner as ConsentBanner,
	DeferredConsentDialog as ConsentDialog,
} from '@inth/react/deferred';
import { describe, expect, test } from 'vitest';

import packageJson from '../../package.json';
// oxlint-disable-next-line import/default -- Vite's `?raw` query makes the file's source the default export.
import clientComponentsSource from '../client-components.ts?raw';
import { defineConsentConfig } from '../config';
import * as reactServer from '../index.react-server';
import { InthProvider } from '../root';

describe('@inth/nextjs react-server entry', () => {
	test('resolves under the react-server condition', () => {
		expect(packageJson.exports['.']).toMatchObject({
			'react-server': './dist/index.react-server.js',
		});
	});

	test('names the quickstart components through one client module', () => {
		expect(clientComponentsSource.startsWith("'use client';")).toBe(true);
		expect(reactServer).toMatchObject({
			ConsentBanner,
			ConsentDialog,
			ConsentDialogLink,
			InthProvider,
		});
	});

	test('exports what a Server Component layout renders or passes on', () => {
		expect(reactServer.ConsentDialogTrigger).toBeDefined();
		expect(reactServer.ConsentGate).toBeDefined();
		expect(reactServer.ConsentTheme).toBeDefined();
		expect(reactServer.ConsentWidget).toBeDefined();
		expect(reactServer.defineTheme).toBeDefined();
	});

	test('exports the config helpers and the mode data factories', () => {
		expect(reactServer.defineConsentConfig).toBe(defineConsentConfig);
		expect(reactServer.manifest({ resolve: 'browser' })).toEqual({
			resolve: 'browser',
			type: 'manifest',
		});
		expect(reactServer.hosted()).toEqual({ type: 'hosted' });
		expect(reactServer).not.toHaveProperty('offline');
	});
});
