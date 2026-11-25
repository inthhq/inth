/**
 * The encoders load with the write code and the decoders with the first
 * load, so each keeps its own copy of the compact codes. They must agree,
 * or a record this release writes would not read back.
 */
import { OPT_OUT_RIGHTS } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vite-plus/test';

import { OPTIONAL_CONSENT_CATEGORIES } from '../../../consent-record/types';
import {
	CATEGORY_CODES as DECODED_CATEGORY_CODES,
	IAB_CODES as DECODED_IAB_CODES,
	OPT_OUT_HOLDER_CODES as DECODED_OPT_OUT_HOLDER_CODES,
	OPT_OUT_LOCAL_ACT_CODES as DECODED_OPT_OUT_LOCAL_ACT_CODES,
	OPT_OUT_METHOD_CODES as DECODED_OPT_OUT_METHOD_CODES,
	OPT_OUT_RIGHT_CODES as DECODED_OPT_OUT_RIGHT_CODES,
	SUBJECT_CODES as DECODED_SUBJECT_CODES,
} from '../record-codec.model';
import {
	CATEGORY_CODES,
	IAB_CODES,
	OPT_OUT_HOLDER_CODES,
	OPT_OUT_LOCAL_ACT_CODES,
	OPT_OUT_METHOD_CODES,
	OPT_OUT_RIGHT_CODES,
	SUBJECT_CODES,
} from '../writer/record-encode.model';

describe('compact codes', () => {
	test('the encoder and the decoder use the same codes', () => {
		expect(Object.fromEntries(CATEGORY_CODES)).toEqual(DECODED_CATEGORY_CODES);
		expect(Object.fromEntries(SUBJECT_CODES)).toEqual(DECODED_SUBJECT_CODES);
		expect(Object.fromEntries(IAB_CODES)).toEqual(DECODED_IAB_CODES);
		expect(Object.fromEntries(OPT_OUT_RIGHT_CODES)).toEqual(
			DECODED_OPT_OUT_RIGHT_CODES
		);
		expect(Object.fromEntries(OPT_OUT_METHOD_CODES)).toEqual(
			DECODED_OPT_OUT_METHOD_CODES
		);
		expect(Object.fromEntries(OPT_OUT_HOLDER_CODES)).toEqual(
			DECODED_OPT_OUT_HOLDER_CODES
		);
		expect(Object.fromEntries(OPT_OUT_LOCAL_ACT_CODES)).toEqual(
			DECODED_OPT_OUT_LOCAL_ACT_CODES
		);
	});

	test('categories and opt-out rights are encoded in canonical order', () => {
		expect(CATEGORY_CODES.map(([category]) => category)).toEqual(
			OPTIONAL_CONSENT_CATEGORIES
		);
		expect(OPT_OUT_RIGHT_CODES.map(([right]) => right)).toEqual(OPT_OUT_RIGHTS);
	});
});
