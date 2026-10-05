import { describe, expect, it } from 'vitest';
import { ATTACHMENT_PREVIEW_MAX_BYTES, parseSafeAttachmentPreview } from './attachmentPolicy.js';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const payload = (mimeType = 'application/pdf', buffer = pdf, filename = 'receipt.pdf') => ({
  dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
  mimeType,
  filename,
});

describe('native attachment preview validation', () => {
  it.each([
    ['application/pdf', pdf, 'رسید.pdf', '.pdf'],
    ['image/png', png, 'receipt.png', '.png'],
    ['image/gif', gif, 'receipt.gif', '.gif'],
    ['image/jpeg', Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]), 'receipt.jpeg', '.jpg'],
  ])('accepts a supported document and fixes its output extension: %s', (mimeType, buffer, filename, extension) => {
    const result = parseSafeAttachmentPreview(payload(mimeType, buffer, filename));
    expect(result.buffer).toEqual(buffer);
    expect(result.extension).toBe(extension);
  });

  it('accepts a WebP structure with a correct RIFF length', () => {
    const webp = Buffer.alloc(22);
    webp.write('RIFF');
    webp.writeUInt32LE(14, 4);
    webp.write('WEBPVP8L', 8);
    webp.writeUInt32LE(2, 16);
    expect(parseSafeAttachmentPreview(payload('image/webp', webp, 'receipt.webp')).extension).toBe('.webp');
  });

  it('accepts a BMP structure with a bounded image header', () => {
    const bmp = Buffer.alloc(58);
    bmp.write('BM');
    bmp.writeUInt32LE(58, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    expect(parseSafeAttachmentPreview(payload('image/bmp', bmp, 'receipt.bmp')).extension).toBe('.bmp');
  });

  it.each(['.cmd', '.bat', '.exe', '.com', '.ps1', '.lnk', '.url', '.html', '.hta', '.svg', '.pdf.exe'])('rejects an executable or active filename even with a real PDF payload: %s', (extension) => {
    expect(() => parseSafeAttachmentPreview(payload('application/pdf', pdf, `receipt${extension}`))).toThrow('UNSUPPORTED_ATTACHMENT_EXTENSION');
  });

  it.each(['text/html', 'image/svg+xml', 'application/octet-stream', 'text/plain', 'constructor'])('rejects types outside document and raster formats: %s', (type) => {
    expect(() => parseSafeAttachmentPreview(payload(type, Buffer.from('untrusted content'), 'receipt'))).toThrow('UNSUPPORTED_ATTACHMENT_TYPE');
  });

  it('does not let an overriding MIME disguise the data URL', () => {
    expect(() => parseSafeAttachmentPreview({ ...payload('image/png', png, 'receipt.png'), mimeType: 'application/pdf' })).toThrow('ATTACHMENT_TYPE_MISMATCH');
  });

  it.each(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp'])('rejects script bytes falsely labeled as %s', (mimeType) => {
    expect(() => parseSafeAttachmentPreview(payload(mimeType, Buffer.from('@echo off\r\necho test'), 'receipt'))).toThrow('ATTACHMENT_CONTENT_MISMATCH');
  });

  it('rejects an appended command payload rather than opening a PDF polyglot', () => {
    expect(() => parseSafeAttachmentPreview(payload('application/pdf', Buffer.concat([pdf, Buffer.from('@echo off')])))).toThrow('ATTACHMENT_CONTENT_MISMATCH');
  });

  it('rejects appended PNG content or chunk sizes outside the buffer', () => {
    expect(() => parseSafeAttachmentPreview(payload('image/png', Buffer.concat([png, Buffer.from('<script>')]), 'receipt.png'))).toThrow('ATTACHMENT_CONTENT_MISMATCH');
    const malformed = Buffer.from(png);
    malformed.writeUInt32BE(0xffffffff, 8);
    expect(() => parseSafeAttachmentPreview(payload('image/png', malformed, 'receipt.png'))).toThrow('ATTACHMENT_CONTENT_MISMATCH');
  });

  it.each(['data:application/pdf,%PDF-1.7', 'data:application/pdf;base64,@@@@', 'data:application/pdf;base64,AA=', 'https://example.com/file.pdf', ''])('rejects malformed or non-binary attachment URLs: %s', (dataUrl) => {
    expect(() => parseSafeAttachmentPreview({ ...payload(), dataUrl })).toThrow();
  });

  it('rejects oversized data before decoding it', () => {
    const dataUrl = `data:application/pdf;base64,${'A'.repeat(Math.ceil(ATTACHMENT_PREVIEW_MAX_BYTES / 3) * 4 + 101)}`;
    expect(() => parseSafeAttachmentPreview({ ...payload(), dataUrl })).toThrow('ATTACHMENT_TOO_LARGE');
  });

  it('keeps path segments and Windows filename syntax out of the temporary stem', () => {
    const result = parseSafeAttachmentPreview(payload('application/pdf', pdf, '../../dir\\receipt:stream.pdf'));
    expect(result.stem).toBe('receipt_stream');
    expect(result.extension).toBe('.pdf');
  });
});
