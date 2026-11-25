import { expect, test } from 'vite-plus/test';

import { parseConsentPresenterOutcome as native } from '../presenter';
import { parseConsentPresenterOutcome as web } from '../presenter.web';

const PAYLOADS = [
	'{"sessionId":"s1","kind":"committed","revision":3}',
	'{"sessionId":"s1","kind":"dismissed","revision":0,"extra":true}',
	'{"sessionId":"s1","kind":"closed","revision":3}',
	'{"sessionId":1,"kind":"committed","revision":3}',
	'{"sessionId":"s1","kind":"committed","revision":-1}',
	'{"sessionId":"s1","kind":"committed","revision":1.5}',
	'null',
];

const answer = (parse: (payload: string) => unknown, payload: string) => {
	try {
		return parse(payload);
	} catch (error) {
		return String(error);
	}
};

test('the web presenter decodes outcomes exactly as the native one does', () => {
	for (const payload of PAYLOADS) {
		expect(answer(web, payload), payload).toEqual(answer(native, payload));
	}
});
