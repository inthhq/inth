import { join } from 'node:path';

import {
	AngularNodeAppEngine,
	createNodeRequestHandler,
	isMainModule,
	writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

// The app's base href is `/gate-control/`, so its files are served there.
app.use(
	'/gate-control',
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
	const port = Number(process.env['PORT'] ?? 4340);
	const host = process.env['HOST'] ?? '127.0.0.1';
	app.listen(port, host, () => {
		console.log(`Listening on http://${host}:${port}`);
	});
}

export const reqHandler = createNodeRequestHandler(app);
