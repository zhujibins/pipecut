import type {
  ApiErrorBody,
  Material,
  MaterialInput,
  Part,
  PartInput,
  PlanDetail,
  PlanItemInput,
  PlanRequest,
  PlanResult,
  PlanSummary,
} from '../../shared/types';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: { path?: string; message: string }[];

  constructor(message: string, status: number, details?: { path?: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new ApiError(
      body?.error ?? `请求失败（${response.status}）`,
      response.status,
      body?.details,
    );
  }

  return (await response.json()) as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '发生未知错误，请稍后重试';
}

export interface DemoResult {
  ok: boolean;
  materials: number;
  parts: number;
}

export const api = {
  materials: {
    list: () => request<Material[]>('/materials'),
    create: (input: MaterialInput) =>
      request<Material>('/materials', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: MaterialInput) =>
      request<Material>(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: boolean }>(`/materials/${id}`, { method: 'DELETE' }),
  },
  parts: {
    list: () => request<Part[]>('/parts'),
    create: (input: PartInput) =>
      request<Part>('/parts', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: PartInput) =>
      request<Part>(`/parts/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    remove: (id: number) => request<{ ok: boolean }>(`/parts/${id}`, { method: 'DELETE' }),
  },
  plans: {
    list: () => request<PlanSummary[]>('/plans'),
    get: (id: number) => request<PlanDetail>(`/plans/${id}`),
    calculate: (input: PlanRequest) =>
      request<PlanResult>('/plans/calculate', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    save: (input: PlanRequest & { name: string; items: PlanItemInput[] }) =>
      request<{ id: number }>('/plans', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: number) => request<{ ok: boolean }>(`/plans/${id}`, { method: 'DELETE' }),
  },
  demo: {
    load: () => request<DemoResult>('/demo', { method: 'POST' }),
  },
};
