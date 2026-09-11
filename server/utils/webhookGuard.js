import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * SSRF guard for the automation `webhook` action.
 *
 * Rejects schemes other than http(s) and any target that resolves to a
 * private, loopback, link-local, multicast or reserved address. DNS rebinding
 * protection is best-effort: we verify before fetching and forbid redirects,
 * so a follow-the-redirect hop into an internal range is not possible.
 */

const BLOCKED_V4 = new BlockList();
const BLOCKED_V4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
for (const [addr, prefix] of BLOCKED_V4_RANGES) BLOCKED_V4.addSubnet(addr, prefix, 'ipv4');

const BLOCKED_V6 = new BlockList();
const BLOCKED_V6_RANGES = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['::ffff:0:0', 96],
  ['2001:db8::', 32],
];
for (const [addr, prefix] of BLOCKED_V6_RANGES) BLOCKED_V6.addSubnet(addr, prefix, 'ipv6');

export function isBlockedIp(ip) {
  const kind = isIP(ip);
  if (kind === 4) return BLOCKED_V4.check(ip, 'ipv4');
  if (kind === 6) return BLOCKED_V6.check(ip, 'ipv6');
  return true;
}

/**
 * Validate that a webhook target URL is safe to POST to from the server.
 * Returns the parsed URL on success; rejects otherwise. An optional `resolve`
 * override is exposed for tests so DNS never depends on the network.
 */
export async function assertSafeWebhookUrl(urlText, { resolve = lookup } = {}) {
  if (typeof urlText !== 'string' || !/^https?:\/\//i.test(urlText)) {
    throw new Error('Webhook URL must be an absolute http(s) URL');
  }

  let parsed;
  try {
    parsed = new URL(urlText);
  } catch {
    throw new Error('Webhook URL is malformed');
  }

  const hostname = String(parsed.hostname).replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('Webhook URL has no host');
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new Error('Webhook URL points to a private or internal address');
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await resolve(hostname, { all: true });
  } catch {
    throw new Error('Webhook URL host could not be resolved');
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error('Webhook URL host could not be resolved');
  }
  if (addresses.some((entry) => isBlockedIp(entry?.address))) {
    throw new Error('Webhook URL resolves to a private or internal address');
  }
  return parsed;
}