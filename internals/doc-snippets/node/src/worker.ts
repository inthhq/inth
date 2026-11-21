// #region docs:node-worker title="worker.ts"
import { Inth } from '@inth/node';

interface Env {
	INTH_PROJECT_URL: string;
	INTH_SECRET_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const inth = new Inth({
			projectUrl: env.INTH_PROJECT_URL,
			secretKey: env.INTH_SECRET_KEY,
		});
		const externalId = new URL(request.url).searchParams.get('user') ?? '';
		const { data, error } = await inth.consents.check({ externalId });
		if (error) {
			return Response.json({ error: error.message }, { status: 502 });
		}
		return Response.json(data);
	},
};
// #endregion docs:node-worker
