import {
  loadToken,
  saveSession,
  clearSession,
  completePasswordChange,
  type SessionClient,
} from '../storage/session';

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

export type LoginResult = {
  client: SessionClient;
  /**
   * A senha usada foi a que o operador entregou no balcão.
   *
   * Quem manda de verdade é o servidor: o token emitido nesse caso só abre
   * /app/change-password, e qualquer outra rota responde 403
   * PASSWORD_CHANGE_REQUIRED. Este campo existe para o app levar o usuário
   * direto à tela certa em vez de deixá-lo esbarrar no erro.
   */
  mustChangePassword: boolean;
};

export async function login(cpf: string, password: string): Promise<LoginResult> {
  const r = await request<{ token: string; client: SessionClient; must_change_password?: boolean }>(
    '/app/login',
    {
      method: 'POST',
      body: { cpf, password },
      auth: false,
    }
  );
  const mustChangePassword = !!r.must_change_password;
  await saveSession(r.token, r.client, mustChangePassword);
  return { client: r.client, mustChangePassword };
}

export async function fetchConnections(): Promise<ApiConnection[]> {
  return request<ApiConnection[]>('/app/connections');
}

/**
 * Troca de senha — também é o que conclui o primeiro acesso.
 *
 * O servidor devolve um token novo, agora pleno. É preciso guardá-lo: o que
 * está no aparelho pode ser o provisório, recusado em todas as outras rotas.
 * Sem esta troca o cliente definiria a senha e continuaria sem ver as conexões.
 */
export async function changePassword(current_password: string, new_password: string): Promise<void> {
  const r = await request<{ token?: string }>('/app/change-password', {
    method: 'POST',
    body: { current_password, new_password },
  });
  await completePasswordChange(r?.token);
}

export async function logout(): Promise<void> {
  await clearSession();
}

/* =============================================================================
   Assinatura

   O acesso às conexões é pago. Quem decide se libera é o servidor — estas
   funções só transportam o veredito. O app NÃO recalcula a regra dos 3 dias de
   carência: duas implementações da mesma regra divergem no primeiro ajuste, e
   divergir aqui significa mostrar "tudo certo" para quem já está bloqueado.
   ========================================================================== */

export type PlanBenefit = { tipo: string; descricao: string; valor: number };

export type ApiPlan = {
  id: number;
  name: string;
  description: string | null;
  cycle: string;
  price: number;
  dataLimit: number;
  total_connections: number;
  benefits: PlanBenefit[];
};

/** Veredito pronto, vindo do servidor. */
export type AccessState = 'NONE' | 'PENDING' | 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'CANCELED';

export type Access = {
  allowed: boolean;
  state: AccessState;
  daysLeft: number | null;
  message: string | null;
};

export type ApiSubscription = {
  id: number;
  status: string;
  billing_type: 'CREDIT_CARD' | 'PIX';
  plan: ApiPlan | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  card_last4: string | null;
  card_brand: string | null;
};

export async function fetchPlans(): Promise<ApiPlan[]> {
  return request<ApiPlan[]>('/app/plans');
}

/** Pix criado e ainda nao pago — o app retoma o MESMO codigo. */
export type PendingPix = {
  authorization_id: string;
  status: string | null;
  encoded_image: string | null;
  payload: string | null;
  expiration_date: string | null;
};

export async function fetchSubscription(): Promise<{
  subscription: ApiSubscription | null;
  access: Access;
  pending_pix?: PendingPix | null;
}> {
  return request('/app/subscription');
}

export type CardInput = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
  holderCpf?: string;
  addressNumber?: string;
};

export type SubscribeResult = {
  subscription_id: number;
  status: string;
  billing_type: 'CREDIT_CARD' | 'PIX';
  message: string;
  pix?: {
    authorization_id: string;
    encoded_image: string | null;
    payload: string | null;
    expiration_date: string | null;
  };
};

/**
 * Contrata o plano.
 *
 * Volta sempre como PENDING, de propósito: quem confirma o pagamento é o
 * webhook do Asaas. Tratar a resposta desta chamada como "pago" liberaria
 * acesso para cartão que ainda vai ser recusado.
 */
export async function subscribe(
  planId: number,
  billingType: 'CREDIT_CARD' | 'PIX',
  card?: CardInput
): Promise<SubscribeResult> {
  return request<SubscribeResult>('/app/subscription', {
    method: 'POST',
    body: { planId, billingType, card },
  });
}

/**
 * "Já paguei": pede ao servidor que confira no Asaas, em vez de só reler o
 * banco. O webhook pode não ter chegado — e sem este caminho o cliente fica
 * pagando e sem acesso, dependendo de suporte.
 */
export async function syncSubscription(): Promise<{
  access: Access;
  changed: boolean;
  message?: string;
}> {
  return request('/app/subscription/sync', { method: 'POST' });
}

export async function cancelSubscription(): Promise<{ message: string; current_period_end: string | null }> {
  return request('/app/subscription/cancel', { method: 'POST' });
}

export type PendingPayment = {
  id: string;
  value: number;
  due_date: string;
  status: string;
  invoice_url: string | null;
  pix: { encoded_image: string; payload: string } | null;
};

export async function fetchPendingPayment(): Promise<PendingPayment> {
  return request<PendingPayment>('/app/subscription/payment');
}

/**
 * QR de uma conexão específica.
 *
 * O QR é gerado pelo provisionador junto com o .conf e vem em
 * /app/connections — não existe endpoint por id. Buscar a lista e filtrar é o
 * caminho, e o custo é irrelevante: um cliente tem poucas conexões.
 */
export async function fetchConnectionQr(connectionId: number): Promise<ApiConnection | null> {
  const todas = await fetchConnections();
  return todas.find(c => c.id === connectionId) ?? null;
}

/* =============================================================================
   Auto-cadastro

   O cliente cria a propria conta pelo app, sem passar pelo operador. A conta
   nasce SEM assinatura: existir nao da acesso a nada — o portao continua sendo
   o pagamento.
   ========================================================================== */

export type RegisterInput = {
  name: string;
  cpf: string;
  email: string;
  whatsapp: string;
  password: string;
  cep?: string;
  uf?: string;
  cidade?: string;
  bairro?: string;
  logradouro?: string;
  complemento?: string;
};

/**
 * Cria a conta e ja deixa a sessao pronta.
 *
 * A senha e escolhida pelo dono, entao nao ha troca obrigatoria depois — o
 * token que volta ja e pleno.
 */
export async function register(dados: RegisterInput): Promise<SessionClient> {
  const r = await request<{ token: string; client: SessionClient }>('/app/register', {
    method: 'POST',
    body: dados,
    auth: false,
  });
  await saveSession(r.token, r.client, false);
  return r.client;
}

/** Avisa que o CPF ja tem conta ENQUANTO se digita, em vez de so no envio. */
export async function checkCpf(cpf: string): Promise<{ valid: boolean; taken: boolean }> {
  return request(`/app/register/check-cpf?cpf=${encodeURIComponent(cpf)}`, { auth: false });
}
