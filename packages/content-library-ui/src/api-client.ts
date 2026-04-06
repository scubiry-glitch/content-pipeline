// API Client — 内容库 REST API 客户端
// baseURL 可配，适配嵌入式（相对路径）和独立部署（绝对 URL）

export interface ContentLibraryUIConfig {
  /** API 地址 (嵌入: '/api/v1/content-library', 独立: 'https://cl.example.com/api/v1/content-library') */
  apiBaseUrl: string;
  /** 额外请求头 */
  headers?: Record<string, string>;
}

let config: ContentLibraryUIConfig = {
  apiBaseUrl: '/api/v1/content-library',
};

/** 配置 API 客户端 */
export function configure(newConfig: Partial<ContentLibraryUIConfig>): void {
  config = { ...config, ...newConfig };
}

/** 获取当前配置 */
export function getConfig(): ContentLibraryUIConfig {
  return { ...config };
}

/** 通用 fetch 封装 */
export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${config.apiBaseUrl}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json', ...config.headers },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...config.headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
