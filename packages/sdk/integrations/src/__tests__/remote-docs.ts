/**
 * Renders the remote integrations table in the docs from the catalogue.
 * `remote-docs.test.ts` fails when the committed table drifts; run
 * `vp test run src/remote-docs.test.ts -u` in this package to rewrite it.
 */
import { remoteIntegrations } from '../remote';
import type { RemoteOptionSpec } from '../remote';

const code = (value: string | number | boolean) =>
	`\`${String(value).replaceAll('|', String.raw`\|`)}\``;

const choices = (values: readonly string[]) => {
	const quoted = values.map((value) => code(value));
	return quoted.length > 1
		? `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`
		: (quoted[0] ?? '');
};

const describeOption = function describeOption(spec: RemoteOptionSpec): string {
	switch (spec.kind) {
		case 'id': {
			return `ID such as ${code(spec.example)}`;
		}
		case 'hostname': {
			return `hostname such as ${code(spec.example)}`;
		}
		case 'enum': {
			return `${choices(spec.values)}, default ${code(spec.default)}`;
		}
		case 'boolean': {
			return `\`true\` or \`false\`, default ${code(spec.default)}`;
		}
		case 'number': {
			const range = [
				spec.min === undefined ? '' : `at least ${spec.min}`,
				spec.max === undefined ? '' : `at most ${spec.max}`,
			].filter(Boolean);
			return [spec.integer === true ? 'integer' : 'number', ...range].join(
				', '
			);
		}
		case 'idList': {
			return `up to ${spec.maxItems} IDs such as ${code(spec.example)}`;
		}
		case 'map': {
			return `up to ${spec.maxEntries} keys such as ${code(spec.keyExample)}, each ${choices(spec.values)}`;
		}
		case 'object': {
			return `object of ${Object.keys(spec.fields)
				.map((name) => code(name))
				.join(', ')}`;
		}
		default: {
			throw new Error('unknown option kind');
		}
	}
};

/** The MDX partial the docs include. */
export const renderRemoteDocs = function renderRemoteDocs(): string {
	const rows = Object.values(remoteIntegrations).map((integration) => {
		const options = Object.entries(integration.options)
			.map(([name, spec]) => {
				const required = 'required' in spec && spec.required;
				return `${code(name)}${required ? ' (required)' : ''}: ${describeOption(spec)}`;
			})
			.join('; ');
		return `| ${code(integration.key)} | ${integration.label} | ${options} |`;
	});
	return [
		'{/* Generated from the remote exports in packages/sdk/integrations/src/vendors by packages/sdk/integrations/src/remote-docs.test.ts. Edit the vendor files. */}',
		'',
		'| Key | Integration | Options |',
		'| --- | --- | --- |',
		...rows,
		'',
	].join('\n');
};
