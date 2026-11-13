import type { BridgeError } from './types.js';

/**
 * Parses an Intel HEX string and loads it into a Uint16Array(16384) representing
 * the ATmega328P program flash (32 KiB = 16384 16-bit words).
 *
 * Returns a BridgeError if validation fails; never throws.
 */
export function hexToProgMem(hex: string): Uint16Array | BridgeError {
  if (hex.trim().length === 0) {
    return { kind: 'invalid-hex', message: 'empty HEX string' };
  }

  const progMem = new Uint16Array(16384); // zero-initialized
  let baseAddress = 0;
  let seenEOF = false;
  let lineNumber = 0;

  for (const rawLine of hex.split('\n')) {
    lineNumber++;
    // Strip trailing \r (CRLF compatibility)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    // Skip empty lines
    if (line.length === 0) continue;

    if (seenEOF) {
      return { kind: 'invalid-hex', message: 'data after EOF record' };
    }

    if (line[0] !== ':') {
      return { kind: 'invalid-hex', message: "line does not start with ':'" };
    }

    // Minimum line length: 1 (':') + 2 (LL) + 4 (AAAA) + 2 (TT) + 2 (CC) = 11 chars
    if (line.length < 11) {
      return { kind: 'invalid-hex', message: `line ${lineNumber} is too short` };
    }

    // Parse fields from hex string
    const byteCount  = parseInt(line.slice(1, 3),   16);
    const loadAddrHi = parseInt(line.slice(3, 5),   16);
    const loadAddrLo = parseInt(line.slice(5, 7),   16);
    const loadAddress = (loadAddrHi << 8) | loadAddrLo;
    const recordType = parseInt(line.slice(7, 9),   16);

    // Expected line length: 1 + (byteCount + 4) * 2 = 11 + byteCount*2
    const expectedLen = 11 + byteCount * 2;
    if (line.length < expectedLen) {
      return { kind: 'invalid-hex', message: `line ${lineNumber} is too short for declared byte count` };
    }

    // Parse data bytes
    const data: number[] = [];
    for (let i = 0; i < byteCount; i++) {
      data.push(parseInt(line.slice(9 + i * 2, 11 + i * 2), 16));
    }

    // Parse checksum byte
    const checksumOffset = 9 + byteCount * 2;
    const checksumByte = parseInt(line.slice(checksumOffset, checksumOffset + 2), 16);

    // Validate checksum: sum of (LL + AAAA_hi + AAAA_lo + TT + data bytes) + CC must be 0x00 mod 256
    let sum = byteCount + loadAddrHi + loadAddrLo + recordType;
    for (const b of data) sum += b;
    sum += checksumByte;
    if ((sum & 0xFF) !== 0x00) {
      return { kind: 'invalid-hex', message: `checksum mismatch at line ${lineNumber}` };
    }

    // Handle record types
    switch (recordType) {
      case 0x00: {
        // Data record
        for (let i = 0; i < byteCount; i++) {
          const addr = baseAddress + loadAddress + i;
          if (addr > 32767) {
            return {
              kind: 'invalid-hex',
              message: `flash overflow: address 0x${addr.toString(16)} exceeds 32767`,
            };
          }
          const wordIndex = addr >> 1;
          if (addr & 1) {
            // Odd address → high byte of word
            progMem[wordIndex] = (progMem[wordIndex] & 0x00FF) | (data[i] << 8);
          } else {
            // Even address → low byte of word
            progMem[wordIndex] = (progMem[wordIndex] & 0xFF00) | data[i];
          }
        }
        break;
      }
      case 0x01:
        // EOF record
        seenEOF = true;
        break;
      case 0x02:
        // Extended segment address record: baseAddress = ((data[0] << 8) | data[1]) << 4
        baseAddress = ((data[0] << 8) | data[1]) << 4;
        break;
      case 0x03:
        // Start segment address — ignore silently
        break;
      default:
        return {
          kind: 'invalid-hex',
          message: `unknown record type 0x${recordType.toString(16).padStart(2, '0')}`,
        };
    }
  }

  if (!seenEOF) {
    return { kind: 'invalid-hex', message: 'missing EOF record' };
  }

  return progMem;
}
