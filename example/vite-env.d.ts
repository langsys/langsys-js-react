/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LANGSYS_PROJECT_ID?: string;
    readonly VITE_LANGSYS_API_KEY?: string;
}

/** The playground's project and keys, from `_dev_/contract/seeds/playground.json` (vite.config.ts). */
declare const __PLAYGROUND__: { projectId: string; keys: { writer: string; public: string } };

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
