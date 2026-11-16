import { join } from 'node:path';

import {
	AngularNodeAppEngine,
	createNodeRequestHandler,
	isMainModule,
	writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';

import { consentRoute } from './consent.server';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(consentRoute.node);

app.use(
	express.static(browserDistFolder, {
		index: false,
		maxAge: '1y',
		redirect: false,
	})
);

/** Renders the page, handing a miss or a failure to `next`. Never rejects. */
const render = async function render(
	request: express.Request,
	response: express.Response,
	next: express.NextFunction
): Promise<void> {
	try {
		const page = await angularApp.handle(request);
		if (!page) {
			return next();
		}
		await writeResponseToNodeResponse(page, response);
	} catch (failure) {
		return next(failure);
	}
};

app.use((request, response, next) => {
	void render(request, response, next);
});

if (isMainModule(import.meta.url)) {
	const port = Number(process.env['PORT'] ?? 4000);
	const host = process.env['HOST'] ?? 'localhost';
	const server = app.listen(port, host, () => {
		console.log(`Listening on http://${host}:${port}`);
	});
	server.on('error', (failure) => {
		throw failure;
	});
}

export const reqHandler = createNodeRequestHandler(app);
