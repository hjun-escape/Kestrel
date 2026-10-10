import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkFileUrl, parseAllowedHosts, DEFAULT_ALLOWED_FILE_HOSTS } from '../base44/functions/analyzeCashflow/fileUrl.ts';
import { runCashflowAnalysis } from '../base44/functions/analyzeCashflow/logic.ts';

describe('checkFileUrl', () => {
  test('accepts https URLs on the Base44 storage host and its subdomains', () => {
    assert.equal(checkFileUrl('https://media.base44.com/files/a/statement.csv').ok, true);
    assert.equal(checkFileUrl('https://base44.app/api/apps/1/files/public/x.csv').ok, true);
    assert.equal(checkFileUrl('https://cdn.base44.app/x.csv').ok, true);
  });

  test('rejects non-https schemes', () => {
    for (const u of ['http://media.base44.com/a.csv', 'file:///etc/passwd', 'ftp://media.base44.com/a', 'javascript:alert(1)', 'not a url']) {
      assert.equal(checkFileUrl(u).ok, false, u);
    }
  });

  test('rejects hosts that are not on the allow-list, including look-alikes', () => {
    for (const u of [
      'https://evil.example/a.csv',
      'https://media.base44.com.evil.example/a.csv',
      'https://notbase44.app/a.csv',
      'https://evil.example/?u=https://media.base44.com/a.csv',
    ]) {
      assert.equal(checkFileUrl(u).ok, false, u);
    }
  });

  test('rejects loopback, private, link-local and obfuscated IP literals', () => {
    for (const u of [
      'https://127.0.0.1/a', 'https://10.0.0.5/a', 'https://192.168.1.1/a', 'https://169.254.169.254/latest/meta-data',
      'https://[::1]/a', 'https://[fd00::1]/a', 'https://2130706433/a', 'https://0x7f000001/a', 'https://localhost/a',
      'https://metadata.google.internal/a', 'https://printer.local/a',
    ]) {
      assert.equal(checkFileUrl(u, ['127.0.0.1', 'localhost', '169.254.169.254', 'metadata.google.internal']).ok, false, u);
    }
  });

  test('rejects credentials and custom ports', () => {
    assert.equal(checkFileUrl('https://user:pw@media.base44.com/a.csv').ok, false);
    assert.equal(checkFileUrl('https://media.base44.com:8443/a.csv').ok, false);
    assert.equal(checkFileUrl('https://media.base44.com:443/a.csv').ok, true);
  });

  test('honours a custom allow-list', () => {
    assert.equal(checkFileUrl('https://files.example/a.csv', ['files.example']).ok, true);
    assert.equal(checkFileUrl('https://media.base44.com/a.csv', ['files.example']).ok, false);
  });
});

describe('parseAllowedHosts', () => {
  test('falls back to defaults when unset or blank', () => {
    assert.deepEqual(parseAllowedHosts(undefined), [...DEFAULT_ALLOWED_FILE_HOSTS]);
    assert.deepEqual(parseAllowedHosts(' , '), [...DEFAULT_ALLOWED_FILE_HOSTS]);
  });
  test('parses, trims and lowercases a list', () => {
    assert.deepEqual(parseAllowedHosts('Files.Example, *.cdn.test'), ['files.example', 'cdn.test']);
  });
});

describe('runCashflowAnalysis file_url guard', () => {
  test('rejects a disallowed URL before fetching anything', async () => {
    let called = 0;
    const result = await runCashflowAnalysis({
      borrowerId: 'b1',
      fileUrl: 'https://169.254.169.254/latest/meta-data',
      fetchText: async () => { called++; return ''; },
      extract: async () => { called++; return {}; },
      invokeLLM: async () => { called++; return {}; },
      now: () => new Date(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'bad_request');
    assert.equal(called, 0);
  });
});
