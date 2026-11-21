// #region docs:node-client title="inth.ts"
import { Inth } from '@inth/node';

export const inth = new Inth({
	projectUrl: 'https://your-project.inth.app',
	secretKey: process.env.INTH_SECRET_KEY,
});
// #endregion docs:node-client
