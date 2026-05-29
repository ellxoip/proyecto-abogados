type ViteImportMeta = ImportMeta & {
  env: {
    VITE_API_BASE_URL?: string;
  };
};

export function getApiBaseUrl() {
  return ((import.meta as ViteImportMeta).env.VITE_API_BASE_URL || '').replace(/\/$/, '');
}
