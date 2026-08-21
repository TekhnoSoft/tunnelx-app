import { loadToken, saveSession, clearSession, type SessionClient } from '../storage/session';

/**
 * Cliente HTTP do aplicativo.
 *
 * Fala apenas com o namespace /app da API: são as rotas que enxergam somente o
 * dono do token. As rotas administrativas ficam de fora por construção — não há
 * função aqui capaz de alcançá-las.
 */
export const BASE_URL = 'https://others-tunnelx-backed.pvuzyy.easypanel.host';

// A rede móvel do cliente costuma ser o elo fraco. Sem teto, o fetch fica
// pendurado e a tela de login parece travada em vez de dar erro.
const TIMEOUT_MS = 20000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await loadToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    // AbortError e falha de DNS chegam aqui como mensagens técnicas que não
    // dizem nada a quem está segurando o telefone.
    throw new ApiError(
      e?.name === 'AbortError'
        ? 'O servidor demorou a responder. Verifique sua conexão e tente de novo.'
        : 'Não foi possível falar com o servidor. Verifique sua conexão.',
      0
    );
  } finally {
    clearTimeout(timer);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Resposta sem corpo JSON (502 do proxy, por exemplo).
  }

  if (!response.ok) {
    // 401 com token guardado = sessão expirada (o token dura 30 dias). Limpar
    // aqui evita o app ficar preso mostrando erro em toda tela sem caminho de
    // volta para o login.
    if (response.status === 401 && options.auth !== false) {
      await clearSession();
    }
    throw new ApiError(data?.message || 'Erro ao comunicar com o servidor.', response.status);
  }

  return data as T;
}

export type ApiConnection = {
  id: number;
  name: string;
  status: string;
  status_queue: 'WAIT' | 'CREATED';
  internet: boolean;
  data_limit: number;
  total_connections: number;
  plan: { name: string; dataLimit: number } | null;
  ready: boolean;
  config: string | null;
  qrcode_base64: string | null;
  updatedAt: string;
};

export async function login(cpf: string, password: string): Promise<SessionClient> {
  const r = await request<{ token: string; client: SessionClient }>('/app/login', {
    method: 'POST',
    body: { cpf, password },
    auth: false,
  });
  await saveSession(r.token, r.client);
  return r.client;
}

export async function fetchConnections(): Promise<ApiConnection[]> {
  return request<ApiConnection[]>('/app/connections');
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  await request('/app/change-password', { method: 'POST', body: { current_password, new_password } });
}

export async function logout(): Promise<void> {
  await clearSession();
}
