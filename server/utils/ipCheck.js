/**
 * IP Address Utilities for CIDR matching and IP validation
 */

/**
 * Check if an IP address is in the allowed list
 * Supports single IPs and CIDR notation
 * 
 * @param {string} clientIp - The client IP address to check
 * @param {string[]} allowedIps - Array of allowed IPs/CIDRs
 * @returns {boolean} - True if IP is allowed
 */
export function isIpAllowed(clientIp, allowedIps) {
  if (!clientIp || !allowedIps || allowedIps.length === 0) {
    return false;
  }

  // Normalize client IP (remove IPv6 prefix if present)
  const normalizedClientIp = clientIp.replace(/^::ffff:/, '');

  for (const allowed of allowedIps) {
    const normalizedAllowed = allowed.trim();
    
    // Check for CIDR notation
    if (normalizedAllowed.includes('/')) {
      if (isIpInCidr(normalizedClientIp, normalizedAllowed)) {
        return true;
      }
    } else {
      // Direct IP comparison
      if (normalizedClientIp === normalizedAllowed) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if an IP address is within a CIDR range
 * 
 * @param {string} ip - The IP address to check
 * @param {string} cidr - The CIDR range (e.g., "192.168.1.0/24")
 * @returns {boolean} - True if IP is in CIDR range
 */
export function isIpInCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const maskBits = parseInt(bits, 10);

  // Handle IPv4
  if (isIPv4(ip) && isIPv4(range)) {
    return isIPv4InCidr(ip, range, maskBits);
  }

  // Handle IPv6
  if (isIPv6(ip) && isIPv6(range)) {
    return isIPv6InCidr(ip, range, maskBits);
  }

  // Mixed IPv4/IPv6 - not compatible
  return false;
}

/**
 * Check if IPv4 address is in CIDR range
 */
function isIPv4InCidr(ip, range, maskBits) {
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  
  // Create mask based on number of bits
  const mask = maskBits === 0 ? 0 : ~((1 << (32 - maskBits)) - 1) >>> 0;
  
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Convert IPv4 address to 32-bit number
 */
function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if string is IPv4 address
 */
function isIPv4(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  
  const parts = ip.split('.').map(p => parseInt(p, 10));
  return parts.every(p => p >= 0 && p <= 255);
}

/**
 * Check if string is IPv6 address
 */
function isIPv6(ip) {
  // Simplified IPv6 check
  return ip.includes(':');
}

/**
 * Check if IPv6 address is in CIDR range
 * Note: Simplified implementation for common cases
 */
function isIPv6InCidr(ip, range, maskBits) {
  // For simplicity, expand IPv6 addresses and compare
  const expandedIp = expandIPv6(ip);
  const expandedRange = expandIPv6(range);
  
  if (!expandedIp || !expandedRange) return false;
  
  // Compare the first maskBits bits
  const bitsToCompare = Math.floor(maskBits / 4);
  const partialNibble = maskBits % 4;
  
  // Full nibbles comparison
  if (expandedIp.slice(0, bitsToCompare) !== expandedRange.slice(0, bitsToCompare)) {
    return false;
  }
  
  // Partial nibble comparison if needed
  if (partialNibble > 0 && bitsToCompare < 32) {
    const ipNibble = parseInt(expandedIp[bitsToCompare], 16);
    const rangeNibble = parseInt(expandedRange[bitsToCompare], 16);
    const mask = (0xF0 >> partialNibble) & 0xF;
    
    return (ipNibble & mask) === (rangeNibble & mask);
  }
  
  return true;
}

/**
 * Expand IPv6 address to full 32-character hex string
 */
function expandIPv6(ip) {
  try {
    // Handle :: shorthand
    if (ip === '::') {
      return '0'.repeat(32);
    }
    
    // Split by ::
    const parts = ip.split('::');
    let left = parts[0] ? parts[0].split(':') : [];
    let right = parts[1] ? parts[1].split(':') : [];
    
    // Expand each part to 4 hex digits
    left = left.map(p => p.padStart(4, '0'));
    right = right.map(p => p.padStart(4, '0'));
    
    // Fill middle with zeros
    const middle = Array(8 - left.length - right.length).fill('0000');
    
    return [...left, ...middle, ...right].join('');
  } catch {
    return null;
  }
}

export default {
  isIpAllowed,
  isIpInCidr
};
