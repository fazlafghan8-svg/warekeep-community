const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
    'image/bmp': ['bmp'],
};
export const ATTACHMENT_INPUT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/gif,image/bmp';
const normalizeMime = (value: string) => value.trim().toLowerCase().replace(/^image\/jpg$/, 'image/jpeg');
/** Convenience validation; the desktop main process also checks the file bytes. */
export const isSupportedAttachmentFile = (file: {
    name: string;
    type: string;
}): boolean => {
    const mimeType = normalizeMime(file.type || '');
    const acceptedExtensions = Object.prototype.hasOwnProperty.call(EXTENSIONS_BY_MIME, mimeType)
        ? EXTENSIONS_BY_MIME[mimeType] : undefined;
    if (!acceptedExtensions)
        return false;
    const leafName = file.name.split(/[/\\]/).pop()?.trim() || '';
    const extension = leafName.includes('.') ? leafName.split('.').pop()?.toLowerCase() : '';
    return !extension || acceptedExtensions.includes(extension);
};
export const isSupportedAttachmentPreview = (attachment: {
    name: string;
    type: string;
    dataUrl: string;
}): boolean => {
    const match = /^data:([^;,]+);base64,/.exec(attachment.dataUrl);
    return !!match && isSupportedAttachmentFile(attachment)
        && normalizeMime(match[1]) === normalizeMime(attachment.type || '');
};
