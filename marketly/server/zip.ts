import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  '.git',
  'data',
  '.aistudio',
  '.gmp_cache',
]);

const EXCLUDE_FILES = new Set([
  'shopfront-editable.zip',
  'shopfront-source.zip',
  'marketly-editable.zip',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'firebase-applet-config.json',
]);

function isSensitiveFile(filename: string): boolean {
  if (EXCLUDE_FILES.has(filename)) return true;
  if (filename.endsWith('.zip') || filename.endsWith('.pem') || filename.endsWith('.key')) return true;
  if (/^\.env(\.|$)/i.test(filename) && filename !== '.env.example') return true;
  return false;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function collectFiles(rootDir: string, currentDir = rootDir): { relPath: string; fullPath: string }[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files: { relPath: string; fullPath: string }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(rootDir, path.join(currentDir, entry.name)));
    } else if (entry.isFile()) {
      if (isSensitiveFile(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (relPath.startsWith('public/assets/aistudio/')) continue;
      files.push({ relPath, fullPath });
    }
  }

  return files;
}

export function buildEditableProjectZip(rootDir = process.cwd()): Buffer {
  const files = collectFiles(rootDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    const rawData = fs.readFileSync(file.fullPath);
    const compressed = zlib.deflateRawSync(rawData);
    const entryName = `marketly/${file.relPath}`;
    const nameBuf = Buffer.from(entryName, 'utf-8');
    const hasNonAscii = /[^\x00-\x7f]/.test(entryName);
    const gpFlag = hasNonAscii ? 0x0800 : 0x0000;
    const crc = crc32(rawData);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(gpFlag, 6);
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by (DOS)
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(gpFlag, 8);
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0x20, 38); // DOS archive attribute
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
