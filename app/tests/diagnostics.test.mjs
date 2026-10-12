import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validCommit, publicHostDiagnostics } from '../src/lib/server/diagnostics.ts';

test('diagnostics whitelist fields and never expose host transport errors', () => {
	const commit = 'a'.repeat(40);
	assert.equal(validCommit(commit), commit);
	assert.equal(validCommit('secret@example.com'), null);
	const data = publicHostDiagnostics({
		localCommit: commit,
		remoteCommit: 'b'.repeat(40),
		remoteCheckedAt: 100,
		remoteError: 'https://secret@server/repo',
		token: 'secret',
		host: {
			available: true,
			clock: '2026-10-12T12:00:00Z',
			uptimeSeconds: 60,
			service: { activeState: 'active', subState: 'secret@server', result: 'success' },
			credentials: 'secret'
		}
	});
	assert.equal(data.remoteCommit, 'b'.repeat(40));
	assert.equal(data.remoteCheckedAt, 100);
	assert.equal(data.host.service.subState, 'unknown');
	assert.equal(JSON.stringify(data).includes('secret'), false);
	assert.equal(publicHostDiagnostics(null).host.available, false);
});
