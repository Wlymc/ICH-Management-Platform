import type {
  ChatResponse,
  ExploreData,
  FilterOptions,
  HomeData,
  InheritorDetailData,
  InheritorSummary,
  ModelGalleryData,
  NarrationData,
  Organization,
  OrganizationDetailData,
  Paginated,
  ProjectDetailData,
  ProjectSummary,
  VisitGuideData,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api/public').replace(/\/$/, '');

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error: string | null;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(`服务器返回异常（HTTP ${response.status}）`, response.status);
  }
  if (!response.ok || !payload?.ok) {
    throw new ApiError(payload?.error || `请求失败（HTTP ${response.status}）`, response.status);
  }
  return payload.data;
}

function queryParams(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export type QueryValues = Record<string, string | number | undefined>;

export const publicApi = {
  home: () => request<HomeData>('/home'),
  models: () => request<ModelGalleryData>('/models'),
  options: () => request<FilterOptions>('/options'),
  projects: (query: QueryValues = {}) =>
    request<Paginated<ProjectSummary>>(`/projects${queryParams(query)}`),
  project: (id: number) => request<ProjectDetailData>(`/projects/${id}`),
  inheritors: (query: QueryValues = {}) =>
    request<Paginated<InheritorSummary>>(`/inheritors${queryParams(query)}`),
  inheritor: (id: number) => request<InheritorDetailData>(`/inheritors/${id}`),
  organizations: (query: QueryValues = {}) =>
    request<Paginated<Organization>>(`/organizations${queryParams(query)}`),
  visitGuide: () => request<VisitGuideData>('/visit'),
  organization: (id: number) => request<OrganizationDetailData>(`/organizations/${id}`),
  explore: () => request<ExploreData>('/explore'),
  chat: (body: {
    message: string;
    sessionId: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    context: { page: string; projectId?: number; projectName?: string };
  }) =>
    request<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  narrate: (projectId: number, mode: 'brief' | 'detailed' | 'child') =>
    request<NarrationData>(`/ai/narrate?project_id=${projectId}&mode=${mode}`),
};
