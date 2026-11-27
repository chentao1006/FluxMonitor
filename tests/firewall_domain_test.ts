import assert from 'node:assert/strict';
import test from 'node:test';
import { signSessionToken, verifySessionToken } from '../src/lib/auth';
import {
  createBlankRule,
  extractClientIp,
  normalizeFirewallErrorCode,
  parseFirewallApplyRequest,
  parseFirewallPolicy,
  parseFirewallStatus,
  parsePortSpecs,
  parseRuleDraft,
  parseSourcesText,
  policiesEqual,
  type FirewallPolicy,
} from '../src/lib/firewall';

test('parsePortSpecs normalizes ranges and rejects invalid values', () => {
  assert.deepEqual(parsePortSpecs('*'), { ok: true, value: '*' });
  assert.deepEqual(parsePortSpecs('1-65535'), { ok: true, value: '*' });
  assert.deepEqual(parsePortSpecs('443, 80, 81-83, 82'), { ok: true, value: '80-83,443' });

  for (const invalid of ['', '0', '65536', '443-80', '80,', 'ssh', '80,'.repeat(800)]) {
    assert.deepEqual(parsePortSpecs(invalid), { ok: false, error: 'port' });
  }
});

test('parseSourcesText canonicalizes strict IPv4/IPv6 CIDRs and rejects host bits', () => {
  assert.deepEqual(parseSourcesText('  ANY  '), { ok: true, value: ['any'] });
  assert.deepEqual(parseSourcesText('2001:0db8::1， 192.0.2.5, 192.0.2.0/24\n192.0.2.5'), {
    ok: true,
    value: ['192.0.2.0/24', '192.0.2.5/32', '2001:db8::1/128'],
  });
  assert.deepEqual(parseSourcesText('0.0.0.0/0, ::/0'), {
    ok: true,
    value: ['0.0.0.0/0', '::/0'],
  });
  assert.deepEqual(parseSourcesText('::ffff:192.0.2.1'), {
    ok: true,
    value: ['::ffff:c000:201/128'],
  });

  assert.deepEqual(parseSourcesText('   '), { ok: false, error: 'sources' });
  const tooMany = Array.from({ length: 129 }, (_, i) => `10.0.0.${i}`).join(',');
  assert.deepEqual(parseSourcesText(tooMany), { ok: false, error: 'sources' });

  for (const bad of [
    '192.168.1.5/24',
    '2001:db8::1/64',
    '010.0.0.1',
    '1.0.0.0/0',
    '::1/0',
    '1:2:3:4:5:6:7::8',
    '2001:db8::1::2',
    'any, 192.0.2.1',
  ]) {
    assert.deepEqual(parseSourcesText(bad), { ok: false, error: 'source_address' });
  }
});

test('parseRuleDraft handles full-width punctuation and validates fields', () => {
  const valid = parseRuleDraft({
    enabled: true,
    action: 'deny',
    protocol: 'tcp/udp',
    sourcesText: '198.51.100.1，2001:db8::/32',
    portsText: '80，443，8000-8010',
    description: 'block public web',
  });
  assert.deepEqual(valid, {
    ok: true,
    value: {
      enabled: true,
      action: 'deny',
      protocol: 'tcp/udp',
      sources: ['198.51.100.1/32', '2001:db8::/32'],
      ports: '80,443,8000-8010',
      description: 'block public web',
    },
  });

  assert.deepEqual(
    parseRuleDraft({
      enabled: true,
      action: 'allow',
      protocol: 'tcp',
      sourcesText: 'any',
      portsText: '80',
      description: 'x'.repeat(121),
    }),
    { ok: false, error: 'rule' }
  );
});

test('parseFirewallPolicy and parseFirewallApplyRequest enforce strict keys and limits', () => {
  const baseRule = {
    enabled: true,
    action: 'allow' as const,
    protocol: 'tcp' as const,
    sources: ['192.0.2.1'],
    ports: '443,80',
    description: 'web',
  };
  const parsed = parseFirewallPolicy({ version: 1, enabled: true, rules: [baseRule] });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value.rules[0].sources, ['192.0.2.1/32']);
    assert.equal(parsed.value.rules[0].ports, '80,443');
  }

  assert.deepEqual(parseFirewallPolicy({ version: 2, enabled: false, rules: [] }), {
    ok: false,
    error: 'policy',
  });
  assert.deepEqual(parseFirewallPolicy({ version: 1, enabled: false, rules: [], extra: 1 }), {
    ok: false,
    error: 'policy',
  });
  assert.deepEqual(
    parseFirewallPolicy({
      version: 1,
      enabled: true,
      rules: Array.from({ length: 257 }, () => ({ ...baseRule })),
    }),
    { ok: false, error: 'rule_limit' }
  );
  assert.deepEqual(
    parseFirewallPolicy({
      version: 1,
      enabled: true,
      rules: [{ ...baseRule, extra: true }],
    }),
    { ok: false, error: 'rule' }
  );

  assert.deepEqual(
    parseFirewallApplyRequest({
      revision: '',
      policy: { version: 1, enabled: false, rules: [] },
    }),
    { ok: false, error: 'invalid_request' }
  );
  assert.deepEqual(
    parseFirewallApplyRequest({
      revision: 'abc',
      policy: { version: 1, enabled: false, rules: [] },
      extra: true,
    }),
    { ok: false, error: 'invalid_request' }
  );
});

test('parseFirewallStatus distinguishes valid v1, upgrade_required, and unavailable', () => {
  const validStatus = {
    policy: { version: 1, enabled: false, rules: [] },
    revision: 'rev1',
    pfEnabled: false,
    attached: true,
    inSync: true,
  };
  assert.deepEqual(parseFirewallStatus(validStatus), { ok: true, value: validStatus });

  assert.deepEqual(
    parseFirewallStatus({
      ...validStatus,
      policy: { version: 2, enabled: false, rules: [] },
    }),
    { ok: false, error: 'upgrade_required' }
  );
  assert.deepEqual(
    parseFirewallStatus({
      ...validStatus,
      configured: true,
    }),
    { ok: true, value: validStatus }
  );
  assert.deepEqual(
    parseFirewallStatus({
      policy: validStatus.policy,
      revision: 'rev1',
    }),
    { ok: false, error: 'upgrade_required' }
  );
  assert.deepEqual(parseFirewallStatus({ error: 'unavailable' }), { ok: false, error: 'unavailable' });
  assert.deepEqual(parseFirewallStatus(null), { ok: false, error: 'unavailable' });
});

test('extractClientIp prefers x-real-ip, unwraps IPv4-mapped IPv6, strips ports/zones, and falls back safely', () => {
  assert.equal(
    extractClientIp(new Headers({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })),
    '203.0.113.9'
  );
  assert.equal(extractClientIp(new Headers({ 'x-forwarded-for': '::ffff:192.0.2.5, 10.0.0.1' })), '192.0.2.5');
  assert.equal(extractClientIp(new Headers({ 'x-forwarded-for': '::ffff:127.0.0.1' })), '127.0.0.1');
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '[2001:0db8::1]:54321' })), '2001:db8::1');
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '198.51.100.7:1234' })), '198.51.100.7');
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '198.51.100.7:0' })), null);
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '198.51.100.7:99999' })), null);
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': '[2001:db8::1]:99999' })), null);
  assert.equal(extractClientIp(new Headers({ 'x-real-ip': 'fe80::1%en0' })), 'fe80::1');
  assert.equal(
    extractClientIp(new Headers({ 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '203.0.113.9' })),
    '203.0.113.9'
  );
  assert.equal(extractClientIp(new Headers()), null);
});

test('normalizeFirewallErrorCode, policiesEqual, and createBlankRule follow domain contract', () => {
  assert.equal(normalizeFirewallErrorCode('request'), 'invalid_request');
  assert.equal(normalizeFirewallErrorCode('invalid'), 'invalid_request');
  assert.equal(normalizeFirewallErrorCode('Unauthorized'), 'unauthorized');
  assert.equal(normalizeFirewallErrorCode('Invalid token'), 'unauthorized');
  assert.equal(normalizeFirewallErrorCode('permission_denied'), 'permission_denied');
  assert.equal(normalizeFirewallErrorCode('something_else'), 'unavailable');
  assert.equal(normalizeFirewallErrorCode(undefined, 401), 'unauthorized');
  assert.equal(normalizeFirewallErrorCode(undefined, 403), 'forbidden');
  assert.equal(normalizeFirewallErrorCode(undefined, 413), 'request_size');
  assert.equal(normalizeFirewallErrorCode(undefined, 415), 'unsupported_media_type');

  const blankA = createBlankRule();
  const blankB = createBlankRule();
  blankA.sources.push('192.0.2.1/32');
  assert.deepEqual(blankB.sources, ['any']);

  const p1: FirewallPolicy = {
    version: 1,
    enabled: true,
    rules: [{ enabled: true, action: 'allow', protocol: 'tcp', sources: ['any'], ports: '80', description: '' }],
  };
  const p2: FirewallPolicy = {
    version: 1,
    enabled: true,
    rules: [{ description: '', ports: '80', sources: ['any'], protocol: 'tcp', action: 'allow', enabled: true }],
  };
  assert.equal(policiesEqual(p1, p2), true);
  assert.equal(policiesEqual(p1, { ...p2, enabled: false }), false);
});

test('auth helper signs and verifies HS256 session tokens', async () => {
  const prevSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-firewall-domain-suite';
  try {
    const token = await signSessionToken('alice', '1h');
    assert.deepEqual(await verifySessionToken(token), { username: 'alice' });
    assert.equal(await verifySessionToken(token + 'tampered'), null);

    process.env.JWT_SECRET = 'different-secret';
    assert.equal(await verifySessionToken(token), null);
  } finally {
    if (prevSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = prevSecret;
    }
  }
});
