import { describe, expect, it } from 'vitest';
import { COMMUNITY_DISABLED_IPC_CHANNELS, isCommunityRequestAllowed } from './communityPolicy.js';

describe('Community desktop network boundary', () => {
  it.each([
    'file:///C:/WareKeep/dist/index.html',
    'data:text/html,<p>Local report</p>',
    'data:image/png;base64,cGljdHVyZQ==',
    'blob:file:///local-preview',
    'about:blank',
  ])('keeps local reports, previews and app resources available: %s', (url) => {
    expect(isCommunityRequestAllowed(url)).toBe(true);
  });

  it.each([
    'https://api.warekeep.com/api/v1/health',
    'https://example.supabase.co/auth/v1/token',
    'wss://example.supabase.co/realtime/v1',
    'http://127.0.0.1:5000/api/v1/data',
    'http://localhost:5175',
    'ftp://example.com/file',
    'file://remote-fileserver/share/report.html',
    'not-a-url',
  ])('blocks packaged runtime network traffic: %s', (url) => {
    expect(isCommunityRequestAllowed(url)).toBe(false);
  });

  it('allows only the separate development server and its HMR socket', () => {
    expect(isCommunityRequestAllowed('http://127.0.0.1:5175/src/index.tsx', true)).toBe(true);
    expect(isCommunityRequestAllowed('ws://localhost:5175/', true)).toBe(true);
    expect(isCommunityRequestAllowed('http://[::1]:5175/', true)).toBe(true);
    expect(isCommunityRequestAllowed('https://example.com/', true)).toBe(false);
    expect(isCommunityRequestAllowed('http://localhost:5000/', true)).toBe(false);
    expect(isCommunityRequestAllowed('http://localhost.example.com:5175/', true)).toBe(false);
    expect(isCommunityRequestAllowed('http://user:pass@localhost:5175/', true)).toBe(false);
  });

  it('blocks native cloud bridges without blocking local persistence or export', () => {
    for (const channel of ['backend-request', 'probe-backend', 'download-and-open-installer', 'open-external-url']) {
      expect(COMMUNITY_DISABLED_IPC_CHANNELS.has(channel)).toBe(true);
    }
    for (const channel of ['save-data', 'load-data', 'save-data-patch', 'backup-data', 'generate-report-pdf', 'open-attachment-data-url']) {
      expect(COMMUNITY_DISABLED_IPC_CHANNELS.has(channel)).toBe(false);
    }
  });
});
