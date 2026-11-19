import { buildBrowserBenchManifest } from '@inth/benchmarking/policy-fixtures';
import { NextResponse } from 'next/server';

const manifest = buildBrowserBenchManifest();

export const GET = function GET() {
	return NextResponse.json(manifest, {
		headers: {
			'cache-control': 'public, max-age=300',
		},
	});
};
