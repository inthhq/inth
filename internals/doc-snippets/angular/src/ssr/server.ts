// #region docs:ssr-server title="src/server.ts"
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

// Before the Angular engine: answers /api/inth and calls next() otherwise.
app.use(consentRoute.node);

app.use(
	express.static(browserDistFolder, {
		index: false,
		maxAge: '1y',
		redirect: false,
	})
);

/** Renders the page, handing a miss or a failure to `next`. */
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
	app.listen(port, () => {
		console.log(`Listening on http://localhost:${port}`);
	});
}

export const reqHandler = createNodeRequestHandler(app);
// #endregion docs:ssr-server
