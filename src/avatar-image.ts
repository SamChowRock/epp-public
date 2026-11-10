import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { HttpError } from './http.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
const invalid = () => new HttpError(422, 'Image cannot be processed within the avatar limits', 'AVATAR_UNPROCESSABLE');

// Some PNG decoders expose only the first APNG frame. Walk chunks by their declared
// lengths, never search compressed pixels for the letters in a chunk name.
function checkPng(input: Buffer): void {
  let offset = pngSignature.length;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('latin1', offset + 4, offset + 8);
    offset += 12 + length;
    if (offset > input.length || ['acTL', 'fcTL', 'fdAT'].includes(type)) throw invalid();
    if (type === 'IEND') {
      if (length !== 0 || offset !== input.length) throw invalid();
      return;
    }
  }
  throw invalid();
}

// Skip length-delimited marker payloads (including embedded EXIF thumbnails).
// Inside a scan, FF00 encodes a data byte and FFD0–FFD7 are restart markers.
function checkJpeg(input: Buffer): void {
  let offset = 2;
  let inScan = false;
  while (offset < input.length) {
    if (inScan) offset = input.indexOf(0xff, offset);
    if (offset < 0 || input[offset] !== 0xff) throw invalid();
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (inScan && (marker === 0 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9 && offset === input.length) return;
    if (marker === undefined || marker === 0 || (marker >= 0xd0 && marker <= 0xd9)
      || offset + 2 > input.length) throw invalid();
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) throw invalid();
    if (marker === 0xe2 && input.toString('latin1', offset + 2, offset + 6) === 'MPF\0') throw invalid();
    offset += length;
    inScan = marker === 0xda;
  }
  throw invalid();
}

export async function renderAvatar(filename: string, format: 'jpeg' | 'png'): Promise<Buffer> {
  const input = await readFile(filename);
  const signature = format === 'jpeg' ? jpegSignature : pngSignature;
  if (!input.subarray(0, signature.length).equals(signature)) {
    throw new HttpError(415, 'Bytes do not match the declared format', 'AVATAR_FORMAT');
  }
  if (format === 'png') checkPng(input);
  else checkJpeg(input);
  try {
    const image = sharp(input, { limitInputPixels: 12_000_000, failOn: 'warning', pages: 1 });
    const meta = await image.metadata();
    if (meta.format !== format || (meta.pages ?? 1) !== 1 || meta.width > 8192 || meta.height > 8192) throw invalid();
    const output = await image.autoOrient().resize(256, 256, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 }).timeout({ seconds: 5 }).toBuffer();
    if (output.length > 512 * 1024) throw invalid();
    return output;
  } catch {
    throw invalid();
  }
}
