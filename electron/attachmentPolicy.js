import path from 'node:path';
export const ATTACHMENT_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
// A fixed extension, selected from the actual data URL type, keeps an imported
// filename from being handed to an executable Windows file association.
const FORMATS = {
    'application/pdf': { extension: '.pdf', names: ['.pdf'] },
    'image/jpeg': { extension: '.jpg', names: ['.jpg', '.jpeg', '.jpe', '.jfif'] },
    'image/png': { extension: '.png', names: ['.png'] },
    'image/webp': { extension: '.webp', names: ['.webp'] },
    'image/gif': { extension: '.gif', names: ['.gif'] },
    'image/bmp': { extension: '.bmp', names: ['.bmp'] },
};
const normalizeMime = (value) => String(value || '').trim().toLowerCase().replace(/^image\/jpg$/, 'image/jpeg');
const startsWithBytes = (buffer, bytes) => bytes.every((value, index) => buffer[index] === value);
const hasPngStructure = (buffer) => {
    if (!startsWithBytes(buffer, [137, 80, 78, 71, 13, 10, 26, 10]))
        return false;
    let offset = 8;
    let first = true;
    while (offset + 12 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (size > buffer.length - offset - 12)
            return false;
        if (first && (type !== 'IHDR' || size !== 13))
            return false;
        first = false;
        offset += size + 12;
        if (type === 'IEND')
            return size === 0 && offset === buffer.length;
    }
    return false;
};
const matchesFormat = (buffer, mimeType) => {
    switch (mimeType) {
        case 'application/pdf':
            return /^%PDF-(?:1\.[0-9]|2\.0)(?:\r|\n|\s)/.test(buffer.toString('ascii', 0, 12))
                && /%%EOF[\t\r\n ]*$/.test(buffer.toString('ascii', Math.max(0, buffer.length - 1024)));
        case 'image/png':
            return hasPngStructure(buffer);
        case 'image/jpeg':
            return buffer.length >= 5 && startsWithBytes(buffer, [255, 216, 255])
                && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217;
        case 'image/gif':
            return buffer.length >= 14 && /^(?:GIF87a|GIF89a)$/.test(buffer.toString('ascii', 0, 6))
                && buffer[buffer.length - 1] === 59;
        case 'image/webp':
            return buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF'
                && buffer.readUInt32LE(4) + 8 === buffer.length
                && buffer.toString('ascii', 8, 12) === 'WEBP'
                && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));
        case 'image/bmp': {
            if (buffer.length < 26 || buffer.toString('ascii', 0, 2) !== 'BM')
                return false;
            const headerSize = buffer.readUInt32LE(14);
            const pixelOffset = buffer.readUInt32LE(10);
            return buffer.readUInt32LE(2) === buffer.length
                && [12, 40, 52, 56, 64, 108, 124].includes(headerSize)
                && pixelOffset >= 14 + headerSize && pixelOffset < buffer.length;
        }
        default:
            return false;
    }
};
/** Validate in the privileged process, including attachments restored from a backup. */
export const parseSafeAttachmentPreview = (payload) => {
    const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : '';
    if (dataUrl.length > Math.ceil(ATTACHMENT_PREVIEW_MAX_BYTES / 3) * 4 + 100) {
        throw new Error('ATTACHMENT_TOO_LARGE');
    }
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
    if (!match || match[2].length % 4 !== 0)
        throw new Error('INVALID_ATTACHMENT_DATA_URL');
    const mimeType = normalizeMime(match[1]);
    const format = Object.hasOwn(FORMATS, mimeType) ? FORMATS[mimeType] : undefined;
    if (!format)
        throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
    const declaredMimeType = normalizeMime(payload?.mimeType);
    if (declaredMimeType && declaredMimeType !== mimeType)
        throw new Error('ATTACHMENT_TYPE_MISMATCH');
    const filename = String(payload?.filename || 'attachment').split(/[/\\]/).pop().trim();
    const suppliedExtension = path.extname(filename).toLowerCase();
    if (suppliedExtension && !format.names.includes(suppliedExtension)) {
        throw new Error('UNSUPPORTED_ATTACHMENT_EXTENSION');
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.toString('base64') !== match[2])
        throw new Error('INVALID_ATTACHMENT_PAYLOAD');
    if (buffer.length > ATTACHMENT_PREVIEW_MAX_BYTES)
        throw new Error('ATTACHMENT_TOO_LARGE');
    if (!matchesFormat(buffer, mimeType))
        throw new Error('ATTACHMENT_CONTENT_MISMATCH');
    const stem = filename.slice(0, filename.length - suppliedExtension.length)
        .replace(/[<>:"/\\|?*]/g, '_').replace(/\p{Cc}/gu, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'attachment';
    return { buffer, mimeType, extension: format.extension, stem };
};
