import { userInfo } from 'node:os';
import { promisify } from 'node:util';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { verifySessionToken } from './auth';
import { getConfig } from './config';
import {
  FIREWALL_LIMITS,
  extractClientIp,
  normalizeFirewallErrorCode,
  parseFirewallApplyRequest,
  parseFirewallStatus,
  type FirewallErrorCode,
} from './firewall';

const DEFAULT_HELPER_PATH = '/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf';
const SUDO_PATH = '/usr/bin/sudo';
const HELPER_TIMEOUT_MS = 25_000;
const HELPER_MAX_BUFFER = 256 * 1024;

export interface HelperExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  spawnErrorCode?: string;
}

export interface FirewallServerRuntime {
  helperExists: (filePath: string) => boolean;
  execHelper: (command: string, args: string[], stdin: string) => Promise<HelperExecResult>;
}

function defaultHelperExists(filePath: string): boolean {
  try {
    if (!fs.statSync(filePath).isFile()) {
      return false;
    }
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultExecHelper(command: string, args: string[], stdin: string): Promise<HelperExecResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const finish = (result: HelperExecResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ exitCode: null, stdout: '', stderr: '', spawnErrorCode: 'ETIMEDOUT' });
    }, HELPER_TIMEOUT_MS);
    timer.unref?.();

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        exitCode: null,
        stdout: '',
        stderr: '',
        spawnErrorCode: err.code || 'SPAWN_ERROR',
      });
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > HELPER_MAX_BUFFER) {
        child.kill('SIGKILL');
        finish({ exitCode: null, stdout: '', stderr: '', spawnErrorCode: 'EMSGSIZE' });
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > HELPER_MAX_BUFFER) {
        child.kill('SIGKILL');
        finish({ exitCode: null, stdout: '', stderr: '', spawnErrorCode: 'EMSGSIZE' });
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on('close', (code) => {
      finish({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    child.stdin.on('error', () => {});
    child.stdin.end(stdin, 'utf8');
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(error: FirewallErrorCode, status: number): Response {
  return jsonResponse({ error }, status);
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

async function authorize(request: Request): Promise<Response | null> {
  const token = readCookie(request.headers.get('cookie'), 'token');
  if (!token) {
    return errorResponse('unauthorized', 401);
  }
  const session = await verifySessionToken(token);
  if (!session) {
    return errorResponse('unauthorized', 401);
  }
  const config = getConfig();
  const isKnownUser = (config.users || []).some((u) => u.username === session.username);
  if (!isKnownUser || config.features?.firewall === false) {
    return errorResponse('forbidden', 403);
  }
  return null;
}

function verifySameOrigin(request: Request): Response | null {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    return errorResponse('forbidden', 403);
  }

  const originHeader = request.headers.get('origin');
  if (!originHeader || originHeader.endsWith('/')) {
    return errorResponse('forbidden', 403);
  }

  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    return errorResponse('forbidden', 403);
  }
  if (
    (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') ||
    originUrl.username !== '' ||
    originUrl.password !== '' ||
    originUrl.pathname !== '/' ||
    originUrl.search !== '' ||
    originUrl.hash !== ''
  ) {
    return errorResponse('forbidden', 403);
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return errorResponse('forbidden', 403);
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  let expectedProtocol: string;
  if (forwardedProto !== null) {
    const firstProto = forwardedProto.split(',')[0].trim().toLowerCase();
    if (firstProto !== 'http' && firstProto !== 'https') {
      return errorResponse('forbidden', 403);
    }
    expectedProtocol = `${firstProto}:`;
  } else {
    expectedProtocol = requestUrl.protocol;
  }

  if (originUrl.protocol !== expectedProtocol) {
    return errorResponse('forbidden', 403);
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const hostHeader = request.headers.get('host');
  let rawHost: string;
  if (forwardedHost !== null) {
    rawHost = forwardedHost.split(',')[0].trim().toLowerCase();
  } else if (hostHeader !== null) {
    rawHost = hostHeader.trim().toLowerCase();
  } else {
    rawHost = requestUrl.host.toLowerCase();
  }

  if (!rawHost || /[\s/\\@?#]/.test(rawHost)) {
    return errorResponse('forbidden', 403);
  }

  let expectedUrl: URL;
  try {
    expectedUrl = new URL(`${expectedProtocol}//${rawHost}`);
  } catch {
    return errorResponse('forbidden', 403);
  }

  if (originUrl.host.toLowerCase() !== expectedUrl.host.toLowerCase()) {
    return errorResponse('forbidden', 403);
  }
  return null;
}

async function readJsonBodyCapped(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: FirewallErrorCode }> {
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { ok: false, status: 415, error: 'unsupported_media_type' };
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const trimmed = contentLength.trim();
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, status: 400, error: 'invalid_request' };
    }
    if (Number(trimmed) > FIREWALL_LIMITS.maxBodyBytes) {
      return { ok: false, status: 413, error: 'request_size' };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: 'invalid_request' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > FIREWALL_LIMITS.maxBodyBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: 'request_size' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: 'invalid_request' };
  }

  if (totalBytes === 0) {
    return { ok: false, status: 400, error: 'invalid_request' };
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(combined);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'invalid_request' };
  }
}

function isSudoPermissionError(stderr: string): boolean {
  return (
    /a password is required/i.test(stderr) ||
    /not in the sudoers file/i.test(stderr) ||
    /is not allowed to execute/i.test(stderr) ||
    /sudo:\s*(no tty present|sorry, user|command not allowed|unable to authenticate)/i.test(stderr)
  );
}

function classifyHelperResult(result: HelperExecResult): Response {
  if (result.spawnErrorCode === 'ENOENT') {
    return errorResponse('setup_required', 503);
  }
  if (result.spawnErrorCode === 'EACCES') {
    return errorResponse('permission_denied', 503);
  }
  if (result.spawnErrorCode) {
    return errorResponse('unavailable', 503);
  }

  let parsedStdout: unknown = undefined;
  const trimmed = result.stdout.trim();
  if (trimmed.length > 0) {
    try {
      parsedStdout = JSON.parse(trimmed);
    } catch {
      parsedStdout = undefined;
    }
  }

  if (result.exitCode === 0) {
    const parsedStatus = parseFirewallStatus(parsedStdout);
    if (parsedStatus.ok) {
      return jsonResponse(parsedStatus.value, 200);
    }
    return errorResponse(parsedStatus.error, 503);
  }

  if (parsedStdout && typeof parsedStdout === 'object' && !Array.isArray(parsedStdout)) {
    const record = parsedStdout as Record<string, unknown>;
    if (record.error === 'conflict') {
      return errorResponse('conflict', 409);
    }
    if (record.error === 'invalid') {
      const code = normalizeFirewallErrorCode(record.detail);
      return errorResponse(code, code === 'request_size' ? 413 : 400);
    }
    if (record.error === 'unavailable') {
      return errorResponse('unavailable', 503);
    }
  }

  if (isSudoPermissionError(result.stderr)) {
    return errorResponse('permission_denied', 503);
  }

  return errorResponse('unavailable', 503);
}

export function createFirewallHandlers(overrides?: Partial<FirewallServerRuntime>) {
  const runtime: FirewallServerRuntime = {
    helperExists: overrides?.helperExists ?? defaultHelperExists,
    execHelper: overrides?.execHelper ?? defaultExecHelper,
  };

  async function invokeHelper(payload: Record<string, unknown>): Promise<Response> {
    const serialized = JSON.stringify(payload);
    if (Object.prototype.hasOwnProperty.call(process.env, 'FLUX_PF_HELPER')) {
      const helperPath = process.env.FLUX_PF_HELPER;
      if (
        !helperPath ||
        helperPath.trim() !== helperPath ||
        !path.isAbsolute(helperPath) ||
        !runtime.helperExists(helperPath)
      ) {
        return errorResponse('setup_required', 503);
      }
      const result = await runtime.execHelper(helperPath, [], serialized);
      return classifyHelperResult(result);
    }

    if (!runtime.helperExists(DEFAULT_HELPER_PATH)) {
      return errorResponse('setup_required', 503);
    }
    const result = await runtime.execHelper(SUDO_PATH, ['-n', '--', DEFAULT_HELPER_PATH], serialized);
    return classifyHelperResult(result);
  }

  async function GET(request: Request): Promise<Response> {
    const authError = await authorize(request);
    if (authError) {
      return authError;
    }
    return invokeHelper({ action: 'status' });
  }

  async function PUT(request: Request): Promise<Response> {
    const authError = await authorize(request);
    if (authError) {
      return authError;
    }
    const originError = verifySameOrigin(request);
    if (originError) {
      return originError;
    }
    const rawBody = await readJsonBodyCapped(request);
    if (!rawBody.ok) {
      return errorResponse(rawBody.error, rawBody.status);
    }
    const parsedRequest = parseFirewallApplyRequest(rawBody.value);
    if (!parsedRequest.ok) {
      const status = parsedRequest.error === 'request_size' ? 413 : 400;
      return errorResponse(parsedRequest.error, status);
    }
    const client = extractClientIp(request.headers);
    const helperPayload: Record<string, unknown> = {
      action: 'apply',
      revision: parsedRequest.value.revision,
      policy: parsedRequest.value.policy,
    };
    if (client !== null) {
      helperPayload.client = client;
    }
    return invokeHelper(helperPayload);
  }

  let installation: Promise<unknown> | undefined;

  async function POST(request: Request): Promise<Response> {
    const denied = await authorize(request) ?? verifySameOrigin(request);
    if (denied) return denied;

    const directory = process.cwd();
    const installer = [path.join(directory, 'pf/setup.sh'), path.join(directory, 'scripts/pf/setup.sh')]
      .find(defaultHelperExists);
    if (process.platform !== 'darwin' || !installer) return errorResponse('setup_required', 503);

    try {
      installation ??= promisify(execFile)('/usr/bin/osascript', [
        '-e', 'on run argv',
        '-e', 'do shell script (quoted form of (item 1 of argv) & " install --user " & quoted form of (item 2 of argv)) with administrator privileges with prompt "Install the Flux Monitor firewall component"',
        '-e', 'end run', '--', installer, userInfo().username,
      ], { timeout: 180_000 }).finally(() => { installation = undefined; });
      await installation;
    } catch {
      return errorResponse('permission_denied', 503);
    }
    return invokeHelper({ action: 'status' });
  }

  return { GET, PUT, POST };
}

const defaultHandlers = createFirewallHandlers();

export const handleFirewallGet = defaultHandlers.GET;
export const handleFirewallPut = defaultHandlers.PUT;

export const handleFirewallPost = defaultHandlers.POST;
