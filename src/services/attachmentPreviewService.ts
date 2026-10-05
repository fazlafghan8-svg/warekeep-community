import type { PurchaseAttachment } from '../types';
import { isSupportedAttachmentPreview } from '../utils/attachmentTypePolicy';
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/** Minimal subset of `PurchaseAttachment` needed for preview. */
type AttachmentPreviewPayload = Pick<PurchaseAttachment, 'dataUrl' | 'name' | 'type'>;
// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------
/**
 * Whether the current runtime supports opening attachments through the
 * Electron main-process bridge.
 */
const canUseElectronAttachmentPreview = (): boolean => typeof window !== 'undefined' &&
    typeof window.electronAPI?.openAttachmentDataUrl === 'function';
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
const PREVIEW_URL_LIFETIME_MS = 60000;
const buildBrowserPreviewBlob = (dataUrl: string): Blob | null => {
    if (dataUrl.length > Math.ceil(MAX_PREVIEW_BYTES / 3) * 4 + 100)
        return null;
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
    if (!match || !match[2] || match[2].length % 4 !== 0)
        return null;
    const decoded = window.atob(match[2]);
    if (!decoded.length || decoded.length > MAX_PREVIEW_BYTES || window.btoa(decoded) !== match[2])
        return null;
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1)
        bytes[index] = decoded.charCodeAt(index);
    return new Blob([bytes], { type: match[1].toLowerCase().replace(/^image\/jpg$/, 'image/jpeg') });
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Open an attachment for preview.
 *
 * In Electron desktop builds the attachment is handed to the main process
 * which writes a temporary file and opens it with the OS default viewer.
 * Web builds open a validated Blob URL in a new tab without retaining an opener.
 *
 * @param attachment  The attachment to preview (must include `dataUrl`).
 * @returns `true` if the preview was successfully initiated.
 */
export const openAttachmentPreview = async (attachment: AttachmentPreviewPayload): Promise<boolean> => {
    const dataUrl = typeof attachment?.dataUrl === 'string' ? attachment.dataUrl : '';
    if (!dataUrl || !isSupportedAttachmentPreview({ ...attachment, dataUrl }))
        return false;
    try {
        // Desktop: delegate to the Electron main process
        if (canUseElectronAttachmentPreview()) {
            const result = await window.electronAPI.openAttachmentDataUrl?.({
                dataUrl,
                filename: attachment.name,
                mimeType: attachment.type,
            });
            return !!result?.success;
        }
        // Opening with the noopener feature intentionally returns null in Chromium.
        // Retain a blank handle, detach its opener before navigation, and use a Blob
        // URL because top-level data: navigation is restricted by modern browsers.
        if (typeof window.open === 'function') {
            const previewBlob = buildBrowserPreviewBlob(dataUrl);
            if (!previewBlob)
                return false;
            const previewWindow = window.open('', '_blank');
            if (!previewWindow)
                return false;
            let blobUrl: string | null = null;
            try {
                previewWindow.opener = null;
                blobUrl = URL.createObjectURL(previewBlob);
                previewWindow.location.replace(blobUrl);
                const previewUrl = blobUrl;
                window.setTimeout(() => URL.revokeObjectURL(previewUrl), PREVIEW_URL_LIFETIME_MS);
                return true;
            }
            catch (error) {
                if (blobUrl)
                    URL.revokeObjectURL(blobUrl);
                previewWindow.close();
                throw error;
            }
        }
    }
    catch (error) {
        console.warn('Attachment preview failed:', error);
    }
    return false;
};
