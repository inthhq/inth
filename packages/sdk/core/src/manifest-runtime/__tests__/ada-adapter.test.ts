/**
 * The Ada adapter's options check: the Inth server may send only the
 * settings Ada's `start()` takes, each one label of the host Ada builds.
 * Its lifecycle runs in `@inth/integrations`' Ada e2e suite and traces.
 */
import { describe, expect, it } from 'vite-plus/test';

import { adaAdapter } from '../adapters/ada';

describe('the Ada adapter options', () => {
	it('accepts a handle with an optional cluster and domain', () => {
		expect(adaAdapter.problem({ handle: 'agent' })).toBeUndefined();
		expect(
			adaAdapter.problem({ cluster: 'eu', domain: 'ada', handle: 'my-agent' })
		).toBeUndefined();
	});

	it.each([
		[{}, 'its handle is not a single host label'],
		[{ handle: 'agent.evil.example' }, 'its handle is not a single host label'],
		[{ handle: 42 }, 'its handle is not a single host label'],
		[
			{ cluster: 'eu/x', handle: 'agent' },
			'its cluster is not a single host label',
		],
		[{ domain: '', handle: 'agent' }, 'its domain is not a single host label'],
		[{ handle: 'agent', src: 'x' }, 'it has the unknown option src'],
	])('refuses %j', (options, reason) => {
		expect(adaAdapter.problem(options)).toBe(reason);
	});
});
