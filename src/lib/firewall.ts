export type FirewallAction = 'allow' | 'deny';
export type FirewallProtocol = 'tcp' | 'udp' | 'tcp/udp';

export interface FirewallRule {
  enabled: boolean;
  action: FirewallAction;
  protocol: FirewallProtocol;
  sources: string[];
  ports: string;
  description: string;
}

export interface FirewallPolicy {
  version: 1;
  enabled: boolean;
  rules: FirewallRule[];
}

export interface FirewallStatus {
  policy: FirewallPolicy;
  revision: string;
  pfEnabled: boolean;
  attached: boolean;
  inSync: boolean;
}

export interface FirewallApplyRequest {
  revision: string;
  policy: FirewallPolicy;
}

export interface FirewallRuleDraftInput {
  enabled: boolean;
  action: FirewallAction;
  protocol: FirewallProtocol;
  sourcesText: string;
  portsText: string;
  description: string;
}

export const FIREWALL_LIMITS = {
  maxBodyBytes: 65536,
  maxRules: 256,
  maxSourcesPerRule: 128,
  maxPortsLength: 2048,
  maxDescriptionLength: 120,
} as const;

export const FIREWALL_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'setup_required',
  'permission_denied',
  'upgrade_required',
  'unavailable',
  'conflict',
  'management_access',
  'invalid_request',
  'unsupported_media_type',
  'request_size',
  'policy',
  'rule',
  'rule_limit',
  'port',
  'sources',
  'source_address',
] as const;

export type FirewallErrorCode = (typeof FIREWALL_ERROR_CODES)[number];

export type ParseResult<T, E extends FirewallErrorCode = FirewallErrorCode> =
  | { ok: true; value: T }
  | { ok: false; error: E };

const ERROR_CODE_SET = new Set<string>(FIREWALL_ERROR_CODES);
const POLICY_KEYS = ['version', 'enabled', 'rules'] as const;
const RULE_KEYS = ['enabled', 'action', 'protocol', 'sources', 'ports', 'description'] as const;
const APPLY_KEYS = ['revision', 'policy'] as const;

type ParsedCidr =
  | { version: 4; words: [number]; prefix: number; canonical: string }
  | { version: 6; words: number[]; prefix: number; canonical: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(obj: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(obj);
  if (keys.length !== expected.length) {
    return false;
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}

function parseIPv4(text: string): number | null {
  const parts = text.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let acc = 0;
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    acc = ((acc << 8) | octet) >>> 0;
  }
  return acc;
}

function formatIPv4(value: number): string {
  return `${(value >>> 24) & 0xff}.${(value >>> 16) & 0xff}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

function parseIPv6HextetList(tokens: string[], allowEmbeddedIPv4: boolean): number[] | null {
  const groups: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.includes('.')) {
      if (!allowEmbeddedIPv4 || i !== tokens.length - 1) {
        return null;
      }
      const ipv4 = parseIPv4(token);
      if (ipv4 === null) {
        return null;
      }
      groups.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(token)) {
      return null;
    }
    groups.push(parseInt(token, 16));
  }
  return groups;
}

function parseIPv6(text: string): number[] | null {
  if (!text || !text.includes(':') || text.includes(':::')) {
    return null;
  }
  if ((text.startsWith(':') && !text.startsWith('::')) || (text.endsWith(':') && !text.endsWith('::'))) {
    return null;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const hasCompression = halves.length === 2;
  const leftTokens = halves[0] === '' ? [] : halves[0].split(':');
  const rightTokens = hasCompression && halves[1] !== '' ? halves[1].split(':') : [];

  const left = parseIPv6HextetList(leftTokens, !hasCompression);
  if (left === null) {
    return null;
  }
  const right = parseIPv6HextetList(rightTokens, hasCompression);
  if (right === null) {
    return null;
  }

  if (hasCompression) {
    const missing = 8 - (left.length + right.length);
    if (missing < 1) {
      return null;
    }
    return [...left, ...new Array<number>(missing).fill(0), ...right];
  }
  if (left.length !== 8) {
    return null;
  }
  return left;
}

function formatIPv6(groups: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i += 1) {
    if (groups[i] === 0) {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen += 1;
      }
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) {
    return groups.map((g) => g.toString(16)).join(':');
  }
  const head = groups.slice(0, bestStart).map((g) => g.toString(16)).join(':');
  const tail = groups.slice(bestStart + bestLen).map((g) => g.toString(16)).join(':');
  return `${head}::${tail}`;
}

function parseStrictCidr(text: string): ParsedCidr | null {
  if (!/^[a-fA-F0-9:./]+$/.test(text)) {
    return null;
  }
  const slashIndex = text.indexOf('/');
  if (slashIndex !== -1 && text.indexOf('/', slashIndex + 1) !== -1) {
    return null;
  }
  const addrPart = slashIndex === -1 ? text : text.slice(0, slashIndex);
  const prefixPart = slashIndex === -1 ? null : text.slice(slashIndex + 1);

  if (addrPart.includes(':')) {
    const groups = parseIPv6(addrPart);
    if (groups === null) {
      return null;
    }
    let prefix = 128;
    if (prefixPart !== null) {
      if (!/^(?:0|[1-9][0-9]{0,2})$/.test(prefixPart)) {
        return null;
      }
      prefix = Number(prefixPart);
      if (prefix < 0 || prefix > 128) {
        return null;
      }
      const fullGroups = Math.floor(prefix / 16);
      const remBits = prefix % 16;
      if (remBits > 0) {
        const hostMask = (1 << (16 - remBits)) - 1;
        if ((groups[fullGroups] & hostMask) !== 0) {
          return null;
        }
      }
      for (let i = fullGroups + (remBits > 0 ? 1 : 0); i < 8; i += 1) {
        if (groups[i] !== 0) {
          return null;
        }
      }
    }
    return {
      version: 6,
      words: groups,
      prefix,
      canonical: `${formatIPv6(groups)}/${prefix}`,
    };
  }

  const ipv4 = parseIPv4(addrPart);
  if (ipv4 === null) {
    return null;
  }
  let prefix = 32;
  if (prefixPart !== null) {
    if (!/^(?:0|[1-9][0-9]?)$/.test(prefixPart)) {
      return null;
    }
    prefix = Number(prefixPart);
    if (prefix < 0 || prefix > 32) {
      return null;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const hostMask = (~mask) >>> 0;
    if (((ipv4 & hostMask) >>> 0) !== 0) {
      return null;
    }
  }
  return {
    version: 4,
    words: [ipv4],
    prefix,
    canonical: `${formatIPv4(ipv4)}/${prefix}`,
  };
}

function compareParsedCidrs(a: ParsedCidr, b: ParsedCidr): number {
  if (a.version !== b.version) {
    return a.version - b.version;
  }
  for (let i = 0; i < a.words.length; i += 1) {
    if (a.words[i] !== b.words[i]) {
      return a.words[i] - b.words[i];
    }
  }
  return a.prefix - b.prefix;
}

function normalizeSourceList(sources: unknown): ParseResult<string[], 'sources' | 'source_address'> {
  if (!Array.isArray(sources)) {
    return { ok: false, error: 'sources' };
  }
  if (sources.length === 1 && sources[0] === 'any') {
    return { ok: true, value: ['any'] };
  }
  if (sources.length < 1 || sources.length > FIREWALL_LIMITS.maxSourcesPerRule) {
    return { ok: false, error: 'sources' };
  }
  const byCanonical = new Map<string, ParsedCidr>();
  for (const item of sources) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'source_address' };
    }
    const parsed = parseStrictCidr(item);
    if (!parsed) {
      return { ok: false, error: 'source_address' };
    }
    byCanonical.set(parsed.canonical, parsed);
  }
  const sorted = Array.from(byCanonical.values()).sort(compareParsedCidrs);
  return { ok: true, value: sorted.map((entry) => entry.canonical) };
}

function unwrapSingleIp(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith('[')) {
    const end = candidate.indexOf(']');
    if (end === -1) {
      return null;
    }
    const suffix = candidate.slice(end + 1);
    if (suffix) {
      if (!/^:[0-9]{1,5}$/.test(suffix)) {
        return null;
      }
      const port = Number(suffix.slice(1));
      if (port < 1 || port > 65535) {
        return null;
      }
    }
    candidate = candidate.slice(1, end);
  } else {
    const firstColon = candidate.indexOf(':');
    const lastColon = candidate.lastIndexOf(':');
    if (firstColon !== -1 && firstColon === lastColon && candidate.includes('.')) {
      const portPart = candidate.slice(firstColon + 1);
      if (!/^[0-9]{1,5}$/.test(portPart)) {
        return null;
      }
      const port = Number(portPart);
      if (port < 1 || port > 65535) {
        return null;
      }
      candidate = candidate.slice(0, firstColon);
    }
  }

  const percentIndex = candidate.indexOf('%');
  if (percentIndex !== -1) {
    const addr = candidate.slice(0, percentIndex);
    const zone = candidate.slice(percentIndex + 1);
    if (!addr.includes(':') || !zone || !/^[A-Za-z0-9_.-]+$/.test(zone)) {
      return null;
    }
    candidate = addr;
  }

  if (candidate.includes(':')) {
    const groups = parseIPv6(candidate);
    if (groups === null) {
      return null;
    }
    if (
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0xffff
    ) {
      const ipv4 = (((groups[6] << 16) >>> 0) | groups[7]) >>> 0;
      return formatIPv4(ipv4);
    }
    return formatIPv6(groups);
  }

  const ipv4 = parseIPv4(candidate);
  return ipv4 === null ? null : formatIPv4(ipv4);
}

export function createBlankRule(): FirewallRule {
  return {
    enabled: true,
    action: 'allow',
    protocol: 'tcp',
    sources: ['any'],
    ports: '',
    description: '',
  };
}

export function normalizeFirewallErrorCode(value: unknown, httpStatus?: number): FirewallErrorCode {
  if (typeof value === 'string') {
    if (value === 'request' || value === 'invalid') {
      return 'invalid_request';
    }
    if (value === 'Unauthorized' || value === 'Invalid token') {
      return 'unauthorized';
    }
    if (ERROR_CODE_SET.has(value)) {
      return value as FirewallErrorCode;
    }
  }
  if (httpStatus === 401) {
    return 'unauthorized';
  }
  if (httpStatus === 403) {
    return 'forbidden';
  }
  if (httpStatus === 413) {
    return 'request_size';
  }
  if (httpStatus === 415) {
    return 'unsupported_media_type';
  }
  return 'unavailable';
}

export function parsePortSpecs(text: string): ParseResult<string, 'port'> {
  if (text === '*') {
    return { ok: true, value: '*' };
  }
  if (typeof text !== 'string' || text.length === 0 || text.length > FIREWALL_LIMITS.maxPortsLength) {
    return { ok: false, error: 'port' };
  }
  const spans: Array<[number, number]> = [];
  for (const part of text.split(',')) {
    const match = /^([0-9]{1,5})(?:-([0-9]{1,5}))?$/.exec(part.trim());
    if (!match) {
      return { ok: false, error: 'port' };
    }
    const low = Number(match[1]);
    const high = match[2] ? Number(match[2]) : low;
    if (low < 1 || high > 65535 || low > high) {
      return { ok: false, error: 'port' };
    }
    spans.push([low, high]);
  }
  spans.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]));
  const merged: Array<[number, number]> = [];
  for (const [low, high] of spans) {
    const last = merged[merged.length - 1];
    if (last && low <= last[1] + 1) {
      last[1] = Math.max(last[1], high);
    } else {
      merged.push([low, high]);
    }
  }
  if (merged.length === 1 && merged[0][0] === 1 && merged[0][1] === 65535) {
    return { ok: true, value: '*' };
  }
  return {
    ok: true,
    value: merged.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(','),
  };
}

export function parseSourcesText(text: string): ParseResult<string[], 'sources' | 'source_address'> {
  const tokens = text
    .trim()
    .split(/[\s,，]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, error: 'sources' };
  }
  if (tokens.length === 1 && tokens[0].toLowerCase() === 'any') {
    return { ok: true, value: ['any'] };
  }
  return normalizeSourceList(tokens);
}

export function parseRuleDraft(
  input: FirewallRuleDraftInput
): ParseResult<FirewallRule, 'rule' | 'port' | 'sources' | 'source_address'> {
  if (
    typeof input.enabled !== 'boolean' ||
    (input.action !== 'allow' && input.action !== 'deny') ||
    (input.protocol !== 'tcp' && input.protocol !== 'udp' && input.protocol !== 'tcp/udp') ||
    typeof input.description !== 'string' ||
    input.description.length > FIREWALL_LIMITS.maxDescriptionLength
  ) {
    return { ok: false, error: 'rule' };
  }
  const parsedSources = parseSourcesText(input.sourcesText);
  if (!parsedSources.ok) {
    return parsedSources;
  }
  const parsedPorts = parsePortSpecs(input.portsText.replaceAll('，', ',').trim());
  if (!parsedPorts.ok) {
    return parsedPorts;
  }
  return {
    ok: true,
    value: {
      enabled: input.enabled,
      action: input.action,
      protocol: input.protocol,
      sources: parsedSources.value,
      ports: parsedPorts.value,
      description: input.description,
    },
  };
}

export function parseFirewallPolicy(
  value: unknown
): ParseResult<FirewallPolicy, 'policy' | 'rule' | 'rule_limit' | 'port' | 'sources' | 'source_address' | 'request_size'> {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, POLICY_KEYS) ||
    value.version !== 1 ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.rules)
  ) {
    return { ok: false, error: 'policy' };
  }
  if (value.rules.length > FIREWALL_LIMITS.maxRules) {
    return { ok: false, error: 'rule_limit' };
  }
  const rules: FirewallRule[] = [];
  for (const rawRule of value.rules) {
    if (!isPlainObject(rawRule) || !hasExactKeys(rawRule, RULE_KEYS)) {
      return { ok: false, error: 'rule' };
    }
    if (
      typeof rawRule.enabled !== 'boolean' ||
      (rawRule.action !== 'allow' && rawRule.action !== 'deny') ||
      (rawRule.protocol !== 'tcp' && rawRule.protocol !== 'udp' && rawRule.protocol !== 'tcp/udp') ||
      typeof rawRule.description !== 'string' ||
      rawRule.description.length > FIREWALL_LIMITS.maxDescriptionLength
    ) {
      return { ok: false, error: 'rule' };
    }
    const parsedSources = normalizeSourceList(rawRule.sources);
    if (!parsedSources.ok) {
      return parsedSources;
    }
    if (typeof rawRule.ports !== 'string') {
      return { ok: false, error: 'port' };
    }
    const parsedPorts = parsePortSpecs(rawRule.ports);
    if (!parsedPorts.ok) {
      return parsedPorts;
    }
    rules.push({
      enabled: rawRule.enabled,
      action: rawRule.action,
      protocol: rawRule.protocol,
      sources: parsedSources.value,
      ports: parsedPorts.value,
      description: rawRule.description,
    });
  }
  const policy: FirewallPolicy = {
    version: 1,
    enabled: value.enabled,
    rules,
  };
  if (new TextEncoder().encode(JSON.stringify(policy)).length > FIREWALL_LIMITS.maxBodyBytes - 512) {
    return { ok: false, error: 'request_size' };
  }
  return { ok: true, value: policy };
}

export function parseFirewallApplyRequest(
  value: unknown
): ParseResult<
  FirewallApplyRequest,
  'invalid_request' | 'policy' | 'rule' | 'rule_limit' | 'port' | 'sources' | 'source_address' | 'request_size'
> {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, APPLY_KEYS) ||
    typeof value.revision !== 'string' ||
    value.revision.length === 0 ||
    value.revision.length > 128
  ) {
    return { ok: false, error: 'invalid_request' };
  }
  const parsedPolicy = parseFirewallPolicy(value.policy);
  if (!parsedPolicy.ok) {
    return parsedPolicy;
  }
  return {
    ok: true,
    value: {
      revision: value.revision,
      policy: parsedPolicy.value,
    },
  };
}

export function parseFirewallStatus(value: unknown): ParseResult<FirewallStatus, 'upgrade_required' | 'unavailable'> {
  if (!isPlainObject(value)) {
    return { ok: false, error: 'unavailable' };
  }
  const hasPolicyKey = Object.prototype.hasOwnProperty.call(value, 'policy');
  if (
    !hasPolicyKey ||
    typeof value.revision !== 'string' ||
    value.revision.length === 0 ||
    typeof value.pfEnabled !== 'boolean' ||
    typeof value.attached !== 'boolean' ||
    typeof value.inSync !== 'boolean'
  ) {
    return { ok: false, error: hasPolicyKey ? 'upgrade_required' : 'unavailable' };
  }
  const parsedPolicy = parseFirewallPolicy(value.policy);
  if (!parsedPolicy.ok) {
    return { ok: false, error: 'upgrade_required' };
  }
  return {
    ok: true,
    value: {
      policy: parsedPolicy.value,
      revision: value.revision,
      pfEnabled: value.pfEnabled,
      attached: value.attached,
      inSync: value.inSync,
    },
  };
}

export function extractClientIp(headers: Headers): string | null {
  const realIp = headers.get('x-real-ip');
  if (realIp) {
    const parsed = unwrapSingleIp(realIp);
    if (parsed) {
      return parsed;
    }
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    return unwrapSingleIp(first);
  }
  return null;
}

export function policiesEqual(a: FirewallPolicy, b: FirewallPolicy): boolean {
  if (a.version !== b.version || a.enabled !== b.enabled || a.rules.length !== b.rules.length) {
    return false;
  }
  for (let i = 0; i < a.rules.length; i += 1) {
    const left = a.rules[i];
    const right = b.rules[i];
    if (
      left.enabled !== right.enabled ||
      left.action !== right.action ||
      left.protocol !== right.protocol ||
      left.ports !== right.ports ||
      left.description !== right.description ||
      left.sources.length !== right.sources.length
    ) {
      return false;
    }
    for (let j = 0; j < left.sources.length; j += 1) {
      if (left.sources[j] !== right.sources[j]) {
        return false;
      }
    }
  }
  return true;
}
