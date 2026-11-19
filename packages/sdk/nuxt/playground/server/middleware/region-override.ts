export default defineEventHandler((event) => {
	const { country, region } = getQuery(event);
	const { headers } = event.node.req;

	if (typeof country === 'string' && country.length > 0) {
		headers['x-inth-country'] = country.toUpperCase();
	}

	if (typeof region === 'string' && region.length > 0) {
		headers['x-inth-region'] = region.toUpperCase();
	}
});
