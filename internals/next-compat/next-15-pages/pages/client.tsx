import { ConsentShell } from '@inth/next-compat-shared/consent-shell';

const ClientPage = () => (
	<ConsentShell
		styles={false}
		scenario="client"
	>
		<p>Client-only init on a static page.</p>
	</ConsentShell>
);

export default ClientPage;
