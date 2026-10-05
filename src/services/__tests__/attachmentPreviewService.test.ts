import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAttachmentPreview } from '../attachmentPreviewService';

const SAMPLE_ATTACHMENT = {
  dataUrl: 'data:application/pdf;base64,JVBERi0xLjcKJSVFT0YK',
  name: 'hello.pdf',
  type: 'application/pdf'
};

describe('attachmentPreviewService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (window.electronAPI) {
      window.electronAPI.openAttachmentDataUrl = undefined;
    }
  });

  it('uses the Electron attachment preview bridge when available', async () => {
    const openAttachmentDataUrl = vi.fn().mockResolvedValue({
      success: true,
      filePath: 'C:\\Users\\FazlR\\AppData\\Roaming\\WareKeep\\attachment-previews\\hello.pdf'
    });

    window.electronAPI = {
      ...window.electronAPI,
      openAttachmentDataUrl
    } as any;

    const result = await openAttachmentPreview(SAMPLE_ATTACHMENT);

    expect(result).toBe(true);
    expect(openAttachmentDataUrl).toHaveBeenCalledWith({
      dataUrl: SAMPLE_ATTACHMENT.dataUrl,
      filename: SAMPLE_ATTACHMENT.name,
      mimeType: SAMPLE_ATTACHMENT.type
    });
  });

  it('opens a browser Blob preview and detaches its opener before navigation', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      openAttachmentDataUrl: undefined
    } as any;
    const previewWindow = { opener: window, location: { replace: vi.fn() }, close: vi.fn() };
    previewWindow.location.replace.mockImplementation(() => expect(previewWindow.opener).toBeNull());
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(previewWindow as any);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment-preview');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');

    const result = await openAttachmentPreview(SAMPLE_ATTACHMENT);

    expect(result).toBe(true);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(createUrl.mock.calls[0][0]).toMatchObject({ type: 'application/pdf', size: 15 });
    expect(previewWindow.location.replace).toHaveBeenCalledWith('blob:attachment-preview');
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:attachment-preview');
  });

  it('reports a blocked popup without creating a Blob URL', async () => {
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: undefined } as any;
    vi.spyOn(window, 'open').mockReturnValue(null);
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    expect(await openAttachmentPreview(SAMPLE_ATTACHMENT)).toBe(false);
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('cleans up the URL and blank window if navigation fails', async () => {
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: undefined } as any;
    const previewWindow = { opener: window, location: { replace: vi.fn(() => { throw new Error('navigation failed'); }) }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(previewWindow as any);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-preview');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await openAttachmentPreview(SAMPLE_ATTACHMENT)).toBe(false);
    expect(revokeUrl).toHaveBeenCalledWith('blob:failed-preview');
    expect(previewWindow.close).toHaveBeenCalledOnce();
  });

  it.each([
    'data:application/pdf;base64,@@@@',
    'data:application/pdf;base64,AA=',
    'data:application/pdf;base64,',
    'data:application/pdf;base64,AB==',
  ])('rejects malformed binary data without opening a browser window: %s', async (dataUrl) => {
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: undefined } as any;
    const openSpy = vi.spyOn(window, 'open');
    expect(await openAttachmentPreview({ ...SAMPLE_ATTACHMENT, dataUrl })).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('rejects oversized browser attachments before opening a window', async () => {
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: undefined } as any;
    const openSpy = vi.spyOn(window, 'open');
    const dataUrl = `data:application/pdf;base64,${'A'.repeat(Math.ceil(20 * 1024 * 1024 / 3) * 4 + 101)}`;
    expect(await openAttachmentPreview({ ...SAMPLE_ATTACHMENT, dataUrl })).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('returns the native bridge rejection without falling back to a browser', async () => {
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: vi.fn().mockResolvedValue({ success: false }) } as any;
    const openSpy = vi.spyOn(window, 'open');
    expect(await openAttachmentPreview(SAMPLE_ATTACHMENT)).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it.each(['document.cmd', 'document.bat', 'document.exe', 'document.lnk', 'document.html', 'document.svg'])('refuses a restored executable or active document name: %s', async (name) => {
    const openSpy = vi.spyOn(window, 'open');
    const bridge = vi.fn();
    window.electronAPI = { ...window.electronAPI, openAttachmentDataUrl: bridge } as any;
    expect(await openAttachmentPreview({ ...SAMPLE_ATTACHMENT, name })).toBe(false);
    expect(bridge).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('refuses a data URL whose type disagrees with its declared document type', async () => {
    const openSpy = vi.spyOn(window, 'open');
    expect(await openAttachmentPreview({ ...SAMPLE_ATTACHMENT, dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' })).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
