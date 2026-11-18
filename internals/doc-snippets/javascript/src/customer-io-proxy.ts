// #region docs:customer-io-proxy
import { customerIo } from '@inth/integrations/customer-io';

export const proxiedScripts = [
	customerIo({
		cdnUrl: 'https://analytics.example.com',
		loadOptions: {
			integrations: {
				'Customer.io Data Pipelines': {
					apiHost: 'collect.example.com/v1',
					protocol: 'https',
				},
			},
		},
		writeKey: 'YOUR_WRITE_KEY',
	}),
];
// #endregion docs:customer-io-proxy
