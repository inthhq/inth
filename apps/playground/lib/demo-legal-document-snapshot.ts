export const DEMO_LEGAL_DOCUMENT_SNAPSHOT = {
	issuer: 'inth-demo',
	signingKey: 'demo-legal-document-snapshot-signing-key',
	tenantId: 'ins_1',
	ttlSeconds: 1800,
} as const;

export const DEMO_LEGAL_DOCUMENT_SNAPSHOT_AUDIENCE = `inth-legal-document-snapshot:${DEMO_LEGAL_DOCUMENT_SNAPSHOT.tenantId}`;
