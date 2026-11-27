import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { signSessionToken } from '../src/lib/auth';
import { createFirewallHandlers } from '../src/lib/firewall-server';
import type { FirewallPolicy, FirewallStatus } from '../src/lib/firewall';

interface TestFixture {
  dir: string;
  configPath: string;
  helperPath: string;
  statePath: string;
  restoreEnv: () => void;
}

function setupFixture(configOverride?: Record<string, unknown>): TestFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-fw-api-'));
  const configPath = path.join(dir, 'config.json');
  const statePath = path.join(dir, 'helper-state.json');
  const helperPath = path.join(dir, 'fake-helper.mjs');

  const config = {
    users: [{ username: 'admin', password: 'secret' }],
    ai: {},
    features: { firewall: true },
    ...configOverride,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const initialState: { status: FirewallStatus; requests: unknown[]; mode: string } = {
    status: {
      policy: { version: 1, enabled: false, rules: [] },
      revision: 'rev-initial',
      pfEnabled: false,
      attached: true,
      inSync: true,
    },
    requests: [],
    mode: 'ok',
  };
  fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

  const helperCode = `#!/usr/bin/env node
import fs from 'node:fs';

const statePath = ${JSON.stringify(statePath)};
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state.requests.push(req);

if (state.mode === 'legacy') {
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write(JSON.stringify({ ...state.status, policy: { version: 2, enabled: false, rules: [] } }));
  process.exit(0);
}

if (req.action === 'status') {
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write(JSON.stringify(state.status));
  process.exit(0);
}

if (req.action === 'apply') {
  if (state.mode === 'management_access') {
    fs.writeFileSync(statePath, JSON.stringify(state));
    process.stdout.write(JSON.stringify({ error: 'invalid', detail: 'management_access' }));
    process.exit(1);
  }
  if (req.revision !== state.status.revision) {
    fs.writeFileSync(statePath, JSON.stringify(state));
    process.stdout.write(JSON.stringify({ error: 'conflict' }));
    process.exit(1);
  }
  state.status = {
    policy: req.policy,
    revision: 'rev-updated',
    pfEnabled: req.policy.enabled,
    attached: true,
    inSync: true,
  };
  fs.writeFileSync(statePath, JSON.stringify(state));
  process.stdout.write(JSON.stringify(state.status));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ error: 'invalid', detail: 'request' }));
process.exit(1);
`;
  fs.writeFileSync(helperPath, helperCode, { mode: 0o755 });

  const savedEnv = {
    CONFIG_PATH: process.env.CONFIG_PATH,
    JWT_SECRET: process.env.JWT_SECRET,
    FLUX_PF_HELPER: process.env.FLUX_PF_HELPER,
  };

  process.env.CONFIG_PATH = configPath;
  process.env.JWT_SECRET = 'api-test-jwt-secret';
  process.env.FLUX_PF_HELPER = helperPath;

  return {
    dir,
    configPath,
    helperPath,
    statePath,
    restoreEnv: () => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function makePolicy(enabled = true): FirewallPolicy {
  return {
    version: 1,
    enabled,
    rules: [
      {
        enabled: true,
        action: 'deny',
        protocol: 'tcp',
        sources: ['203.0.113.5'],
        ports: '443,80',
        description: 'block scanner',
      },
    ],
  };
}

test('API enforces session auth, known user, and feature flag', async () => {
  const fixture = setupFixture();
  try {
    const { GET, PUT } = createFirewallHandlers();

    const noCookie = await GET(new Request('http://localhost:4210/api/firewall'));
    assert.equal(noCookie.status, 401);
    assert.equal(noCookie.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await noCookie.json(), { error: 'unauthorized' });

    const badCookie = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: 'token=not-a-jwt' } })
    );
    assert.equal(badCookie.status, 401);
    assert.deepEqual(await badCookie.json(), { error: 'unauthorized' });

    const unknownUserToken = await signSessionToken('ghost', '1h');
    const unknownUserRes = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${unknownUserToken}` } })
    );
    assert.equal(unknownUserRes.status, 403);
    assert.deepEqual(await unknownUserRes.json(), { error: 'forbidden' });

    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({ users: [{ username: 'admin', password: 'secret' }], ai: {}, features: { firewall: false } })
    );
    const adminToken = await signSessionToken('admin', '1h');
    const disabledGet = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${adminToken}` } })
    );
    assert.equal(disabledGet.status, 403);
    assert.deepEqual(await disabledGet.json(), { error: 'forbidden' });

    const disabledPut = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${adminToken}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ revision: 'rev-initial', policy: makePolicy() }),
      })
    );
    assert.equal(disabledPut.status, 403);
    assert.deepEqual(await disabledPut.json(), { error: 'forbidden' });

    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({ users: [{ username: 'admin', password: 'secret' }], ai: {}, features: { firewall: true } })
    );
    delete process.env.JWT_SECRET;
    const defaultSecretToken = await signSessionToken('admin', '1h');
    const defaultSecretGet = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${defaultSecretToken}` } })
    );
    assert.equal(defaultSecretGet.status, 200);
  } finally {
    fixture.restoreEnv();
  }
});

test('PUT enforces same-origin, content-type, streaming byte cap, and validation', async () => {
  const fixture = setupFixture();
  try {
    const { PUT } = createFirewallHandlers();
    const token = await signSessionToken('admin', '1h');
    const validBody = JSON.stringify({ revision: 'rev-initial', policy: makePolicy() });

    const crossSite = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
        },
        body: validBody,
      })
    );
    assert.equal(crossSite.status, 403);
    assert.deepEqual(await crossSite.json(), { error: 'forbidden' });

    const missingOrigin = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: validBody,
      })
    );
    assert.equal(missingOrigin.status, 403);

    const wrongOrigin = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://evil.example:4210',
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: validBody,
      })
    );
    assert.equal(wrongOrigin.status, 403);

    const wrongMedia = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'text/plain',
        },
        body: validBody,
      })
    );
    assert.equal(wrongMedia.status, 415);
    assert.deepEqual(await wrongMedia.json(), { error: 'unsupported_media_type' });

    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(70_000).fill(97));
        controller.close();
      },
    });
    const oversizedReq = new Request('http://localhost:4210/api/firewall', {
      method: 'PUT',
      headers: {
        cookie: `token=${token}`,
        origin: 'http://localhost:4210',
        host: 'localhost:4210',
        'content-type': 'application/json',
      },
      body: oversizedStream,
      duplex: 'half',
    } as RequestInit);
    const oversizedRes = await PUT(oversizedReq);
    assert.equal(oversizedRes.status, 413);
    assert.deepEqual(await oversizedRes.json(), { error: 'request_size' });

    const badJson = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'application/json; charset=utf-8',
        },
        body: '{invalid',
      })
    );
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { error: 'invalid_request' });

    const badPort = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          revision: 'rev-initial',
          policy: {
            version: 1,
            enabled: true,
            rules: [{ enabled: true, action: 'deny', protocol: 'tcp', sources: ['any'], ports: '99999', description: '' }],
          },
        }),
      })
    );
    assert.equal(badPort.status, 400);
    assert.deepEqual(await badPort.json(), { error: 'port' });
  } finally {
    fixture.restoreEnv();
  }
});

test('GET and PUT round-trip through FLUX_PF_HELPER, forwarded headers, conflicts, and upgrades', async () => {
  const fixture = setupFixture();
  try {
    const { GET, PUT } = createFirewallHandlers();
    const token = await signSessionToken('admin', '1h');

    const getRes = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
    );
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get('cache-control'), 'no-store');
    const initial = (await getRes.json()) as FirewallStatus;
    assert.equal(initial.revision, 'rev-initial');

    const putRes = await PUT(
      new Request('http://internal:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'https://panel.example.com',
          'x-forwarded-proto': 'https, http',
          'x-forwarded-host': 'panel.example.com:443, internal:4210',
          'x-forwarded-for': '::ffff:192.0.2.5, 10.0.0.1',
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ revision: initial.revision, policy: makePolicy(true) }),
      })
    );
    assert.equal(putRes.status, 200);
    const updated = (await putRes.json()) as FirewallStatus;
    assert.equal(updated.revision, 'rev-updated');
    assert.deepEqual(updated.policy.rules[0].sources, ['203.0.113.5/32']);
    assert.equal(updated.policy.rules[0].ports, '80,443');

    const recorded = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8')).requests as Array<Record<string, unknown>>;
    assert.equal(recorded[1].client, '192.0.2.5');

    const conflictRes = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ revision: 'rev-initial', policy: makePolicy(false) }),
      })
    );
    assert.equal(conflictRes.status, 409);
    assert.deepEqual(await conflictRes.json(), { error: 'conflict' });

    const state = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    state.mode = 'management_access';
    fs.writeFileSync(fixture.statePath, JSON.stringify(state));

    const lockoutRes = await PUT(
      new Request('http://localhost:4210/api/firewall', {
        method: 'PUT',
        headers: {
          cookie: `token=${token}`,
          origin: 'http://localhost:4210',
          host: 'localhost:4210',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ revision: 'rev-updated', policy: makePolicy(true) }),
      })
    );
    assert.equal(lockoutRes.status, 400);
    assert.deepEqual(await lockoutRes.json(), { error: 'management_access' });

    state.mode = 'legacy';
    fs.writeFileSync(fixture.statePath, JSON.stringify(state));
    const upgradeRes = await GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
    );
    assert.equal(upgradeRes.status, 503);
    assert.deepEqual(await upgradeRes.json(), { error: 'upgrade_required' });
  } finally {
    fixture.restoreEnv();
  }
});

test('FLUX_PF_HELPER fails closed for empty/relative paths and default sudo mode classifies errors', async () => {
  const fixture = setupFixture();
  try {
    const token = await signSessionToken('admin', '1h');

    for (const badPath of ['', './scripts/pf/fluxmonitor-pf', '/nonexistent/fluxmonitor-pf']) {
      process.env.FLUX_PF_HELPER = badPath;
      const { GET } = createFirewallHandlers();
      const res = await GET(
        new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
      );
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: 'setup_required' });
    }

    delete process.env.FLUX_PF_HELPER;

    const missingHelper = createFirewallHandlers({ helperExists: () => false });
    const missingRes = await missingHelper.GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
    );
    assert.equal(missingRes.status, 503);
    assert.deepEqual(await missingRes.json(), { error: 'setup_required' });

    let capturedCommand = '';
    let capturedArgs: string[] = [];
    const sudoDenied = createFirewallHandlers({
      helperExists: () => true,
      execHelper: async (cmd, args) => {
        capturedCommand = cmd;
        capturedArgs = args;
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'sudo: a password is required\n',
        };
      },
    });
    const deniedRes = await sudoDenied.GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
    );
    assert.equal(capturedCommand, '/usr/bin/sudo');
    assert.deepEqual(capturedArgs, ['-n', '--', '/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf']);
    assert.equal(deniedRes.status, 503);
    assert.deepEqual(await deniedRes.json(), { error: 'permission_denied' });

    const sudoSpawnMissing = createFirewallHandlers({
      helperExists: () => true,
      execHelper: async () => ({
        exitCode: null,
        stdout: '',
        stderr: '',
        spawnErrorCode: 'ENOENT',
      }),
    });
    const enoentRes = await sudoSpawnMissing.GET(
      new Request('http://localhost:4210/api/firewall', { headers: { cookie: `token=${token}` } })
    );
    assert.equal(enoentRes.status, 503);
    assert.deepEqual(await enoentRes.json(), { error: 'setup_required' });
  } finally {
    fixture.restoreEnv();
  }
});
