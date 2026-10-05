/// <reference types="vite/client" />
/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_KEY?: string;
    readonly VITE_WAREKEEP_HOST_API_BASE_URL?: string;
    readonly VITE_WAREKEEP_FILES_BASE_URL?: string;
    readonly VITE_WAREKEEP_UPDATES_BASE_URL?: string;
    readonly VITE_RELEASE_INSTALLER_MAX_SIZE_BYTES?: string;
    readonly VITE_BACKEND_URL?: string;
    readonly VITE_BACKEND_PROXY_TARGET?: string;
    readonly VITE_DESKTOP_DEFAULT_PUBLIC_BACKEND_URL?: string;
    readonly VITE_DISABLE_DESKTOP_DEFAULT_PUBLIC_BACKEND?: string;
    readonly VITE_DESKTOP_AUTH_REDIRECT?: string;
    readonly VITE_SYNC_MODE?: 'backend_v2' | 'supabase_hybrid';
    readonly VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL?: string;
    readonly VITE_COMMERCIAL_SUPPORT_PHONE?: string;
    readonly VITE_COMMERCIAL_SUPPORT_EMAIL?: string;
    readonly VITE_COMMERCIAL_SUPPORT_URL?: string;
    readonly VITE_COMMERCIAL_SALES_CONTACT_URL?: string;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
