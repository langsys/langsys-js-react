/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LANGSYS_PROJECT_ID?: string;
    readonly VITE_LANGSYS_API_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
