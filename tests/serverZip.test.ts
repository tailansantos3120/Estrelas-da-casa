import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildProjectZipBuffer, createZipBuffer } from '../serverZip.ts';

describe('serverZip PKZIP builder', () => {
  it('creates a valid PKZIP buffer with local headers, central directory, and EOCD', () => {
    const zip = createZipBuffer([
      { name: 'hello.txt', data: Buffer.from('Estrelas da Casa - Cada um por si', 'utf8') },
      { name: 'nested/info.json', data: Buffer.from('{"ok":true}\n'.repeat(10), 'utf8') },
    ]);

    // Starts with PK\x03\x04 local file header signature
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // Ends with EOCD PK\x05\x06 signature (no comment)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    // Total entries = 2
    expect(zip.readUInt16LE(zip.length - 12)).toBe(2);

    // Can inflate compressed nested/info.json payload cleanly
    const centralOffset = zip.readUInt32LE(zip.length - 6);
    expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
    const secondLocalOffset = zip.readUInt32LE(
      centralOffset + 46 + 'hello.txt'.length + 42
    );
    expect(zip.readUInt32LE(secondLocalOffset)).toBe(0x04034b50);
    const secondMethod = zip.readUInt16LE(secondLocalOffset + 8);
    const secondCompSize = zip.readUInt32LE(secondLocalOffset + 18);
    const secondNameLen = zip.readUInt16LE(secondLocalOffset + 26);
    const secondDataStart = secondLocalOffset + 30 + secondNameLen;
    const secondPayload = zip.subarray(secondDataStart, secondDataStart + secondCompSize);
    const inflated =
      secondMethod === 8 ? zlib.inflateRawSync(secondPayload) : secondPayload;
    expect(inflated.toString('utf8')).toBe('{"ok":true}\n'.repeat(10));
  });

  it('packages project source files while excluding runtime database credentials', () => {
    const zip = buildProjectZipBuffer(process.cwd());
    const text = zip.toString('latin1');
    expect(text).toContain('estrelas-da-casa/package.json');
    expect(text).toContain('estrelas-da-casa/src/App.tsx');
    expect(text).toContain('estrelas-da-casa/manifest.json');
    expect(text).not.toContain('estrelas-db.json');
  });
});
