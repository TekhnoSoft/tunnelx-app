import {
  loadToken,
  saveSession,
  clearSession,
  completePasswordChange,
  loadSessionId,
  type SessionClient,
} from '../storage/session';
import { nomeDoAparelho } from '../utils/device';

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

/* =============================================================================
   Sessão encerrada por fora

   A conta vale em um aparelho por vez. Quando alguém entra em outro, ESTE aqui
   descobre pela primeira requisição que responder 401 — pode ser no meio de
   qualquer tela, sem nenhuma ação do usuário.

   Um aviso global resolve porque o problema é global: não adianta cada tela
   tratar o próprio erro. Quem assina é o App, que apaga a sessão, derruba a VPN
   e volta para o login explicando o motivo — em vez de deixar a pessoa vendo
   erros soltos sem entender que foi desconectada.
   ========================================================================== */

export type SessionLostReason = 'SESSION_REPLACED' | 'SESSION_ENDED' | 'SESSION_INVALID' | 'EXPIRED';

type Ouvinte = (motivo: SessionLostReason, mensagem: string) => void;
let ouvinteSessao: Ouvinte | null = null;

/** Registra quem cuida da sessão perdida. Devolve a função que cancela. */
export function onSessionLost(cb: Ouvinte): () => void {
  ouvinteSessao = cb;
  return () => {
    if (ouvinteSessao === cb) ouvinteSessao = null;
  };
}

/**
 * Janela em que avisos repetidos são ignorados.
 *
 * Duas coisas dispararam o mesmo alarme aqui. A primeira é banal: várias
 * requisições em voo quando a sessão cai — o vigia de acesso e a tela de
 * assinatura, por exemplo — e cada uma avisaria, empilhando diálogos.
 *
 * A segunda é um laço de verdade. Sair da conta chama /app/logout; se a sessão
 * já não vale, ele responde 401, que avisa "sessão perdida", que manda sair de
 * novo, que chama /app/logout... A saída explícita marca "quietOn401", e esta
 * janela protege o resto.
 */
const SILENCIO_MS = 5000;
let ultimoAviso = 0;

function notificarSessaoPerdida(silencioso: boolean, motivo: SessionLostReason, mensagem?: string) {
  if (silencioso) return;

  const agora = Date.now();
  if (agora - ultimoAviso < SILENCIO_MS) return;
  ultimoAviso = agora;

  ouvinteSessao?.(motivo, mensagem || 'Sua sessão foi encerrada. Entre novamente.');
}

export class ApiError extends Error {
  status: number;
  /** Corpo da resposta, quando veio JSON. Alguns erros trazem dados úteis. */
  data: any;
  constructor(message: string, status: number, data: any = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean; quietOn401?: boolean } = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, quietOn401 = false } = options;

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

      // O código diz o que aconteceu: substituída por outro aparelho, encerrada
      // por logout, ou um token velho que não vale mais. Sem ele, o usuário só
      // veria o app voltar para o login sozinho.
      const motivo: SessionLostReason =
        data?.code === 'SESSION_REPLACED' || data?.code === 'SESSION_ENDED' || data?.code === 'SESSION_INVALID'
          ? data.code
          : 'EXPIRED';

      notificarSessaoPerdida(quietOn401, motivo, data?.message);
    }
    throw new ApiError(data?.message || 'Erro ao comunicar com o servidor.', response.status, data);
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

  /*
   * De onde vem o direito de usar este túnel.
   *
   * `owned`  = é do próprio cliente, pago pela assinatura dele.
   * `shared` = alguém compartilhou com ele (acesso provisionado).
   *
   * A configuração é a MESMA nos dois casos — é o mesmo túnel. O que muda é o
   * que a tela oferece: o titular administra as vagas, o convidado só usa e
   * pode devolver a vaga.
   */
  owned?: boolean;
  shared?: boolean;

  /** Só em túnel próprio: ocupação das vagas do plano (ShareSlots, abaixo). */
  slots?: ShareSlots | null;

  /** Só em túnel emprestado. */
  share_id?: number;
  owner_name?: string;
  duration_label?: string | null;
  expires_at?: string | null;
  expires_text?: string;
};

/**
 * A conta já está aberta em outro aparelho.
 *
 * Não é falha de login — a senha estava certa. É a escolha voltando para quem
 * está entrando: seguir aqui desconecta o outro.
 */
export class SessionActiveError extends Error {
  device: string;
  since: string | null;
  constructor(message: string, device: string, since: string | null) {
    super(message);
    this.device = device;
    this.since = since;
  }
}

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

/**
 * Entra na conta.
 *
 * @param forcar o usuário viu em que aparelho a conta está e confirmou que quer
 *               desconectá-lo. Sem isso, o servidor recusa com 409 — e é de
 *               propósito: derrubar o outro aparelho em silêncio faria dois
 *               telefones se expulsarem em looping, sem ninguém entender.
 */
export async function login(cpf: string, password: string, forcar = false): Promise<LoginResult> {
  // Se este aparelho já tem uma sessão, manda junto: quando ela for a que está
  // ativa, o servidor deixa entrar sem perguntar se quer desconectar a si mesmo.
  const sessaoAtual = await loadSessionId();

  let r: { token: string; client: SessionClient; must_change_password?: boolean; session_id?: string };
  try {
    r = await request('/app/login', {
      method: 'POST',
      body: {
        cpf,
        password,
        device_name: nomeDoAparelho(),
        current_session: sessaoAtual || undefined,
        ...(forcar ? { force: true } : {}),
      },
      auth: false,
    });
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 409) {
      const d = e.data || {};
      throw new SessionActiveError(e.message, d.device || 'outro aparelho', d.since || null);
    }
    throw e;
  }

  const mustChangePassword = !!r.must_change_password;
  await saveSession(r.token, r.client, mustChangePassword, r.session_id || null);
  return { client: r.client, mustChangePassword };
}



export async function fetchConnections(): Promise<ApiConnection[]> {
  return request<ApiConnection[]>('/app/connections');
}

export type ConnectionsState = {
  /** Resumo de tudo que obriga o app a reagir. Igual = nada mudou. */
  revision: string;
  items: {
    id: number;
    shared: boolean;
    ready: boolean;
    status: string;
    updatedAt: string;
    expires_at: string | null;
  }[];
};

/**
 * Estado das conexões sem a configuração nem o QR.
 *
 * Existe para poder ser chamado de minuto em minuto: a resposta tem centenas de
 * bytes, enquanto `fetchConnections` traz o .conf de cada túnel. É o que permite
 * o app perceber sozinho que o titular removeu o convidado, em vez de o
 * convidado continuar usando uma conexão à qual não tem mais direito até
 * reabrir o aplicativo.
 *
 * Um 402 aqui significa que o acesso acabou — não é falha de rede.
 */
export async function fetchConnectionsState(): Promise<ConnectionsState> {
  return request<ConnectionsState>('/app/connections/state');
}

/**
 * Troca de senha — também é o que conclui o primeiro acesso.
 *
 * O servidor devolve um token novo, agora pleno. É preciso guardá-lo: o que
 * está no aparelho pode ser o provisório, recusado em todas as outras rotas.
 * Sem esta troca o cliente definiria a senha e continuaria sem ver as conexões.
 */
export async function changePassword(current_password: string, new_password: string): Promise<void> {
  const r = await request<{ token?: string; session_id?: string }>('/app/change-password', {
    method: 'POST',
    body: { current_password, new_password },
  });
  // A troca abre sessão NOVA (o servidor derruba as outras). Guardar o id
  // junto evita que o próprio aparelho seja tratado como "outro" num login
  // seguinte.
  await completePasswordChange(r?.token, r?.session_id ?? null);
}

/**
 * Sai da conta — no servidor e no aparelho.
 *
 * Avisar o servidor importa: a conta vale em um aparelho por vez, e sem soltar a
 * sessão lá ela continuaria marcada como em uso. Entrar em outro telefone
 * exigiria passar pela tela de "desconectar o outro" — para um aparelho de onde
 * a pessoa acabou de sair por vontade própria.
 *
 * A limpeza local acontece de qualquer jeito. Se a rede falhar, o pior caso é o
 * próximo login pedir confirmação; prender o usuário dentro do app por causa
 * disso seria pior.
 */
export async function logout(): Promise<void> {
  try {
    // `quietOn401`: sair com a sessão já derrubada responde 401, e avisar aqui
    // reentraria na própria saída — ver notificarSessaoPerdida.
    await request('/app/logout', { method: 'POST', quietOn401: true });
  } catch {
    // Sem rede, ou sessão já encerrada do outro lado.
  }
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
/*
 * GUEST: entra por convite, não por assinatura própria.
 *
 * O app NÃO deduz isso — quem decide é o servidor, no mesmo lugar que decide o
 * resto. Sem este estado, o convidado cairia na tela de planos e seria mandado
 * pagar por um acesso que o titular já pagou.
 */
export type AccessState =
  | 'NONE' | 'PENDING' | 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'CANCELED' | 'GUEST';

export type Access = {
  allowed: boolean;
  state: AccessState;
  daysLeft: number | null;
  message: string | null;
  /** Veio de convite, não de assinatura. */
  asGuest?: boolean;
  shareCount?: number;
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
  const r = await request<{ token: string; client: SessionClient; session_id?: string }>(
    '/app/register',
    {
      method: 'POST',
      body: { ...dados, device_name: nomeDoAparelho() },
      auth: false,
    }
  );
  await saveSession(r.token, r.client, false, r.session_id || null);
  return r.client;
}

/** Avisa que o CPF ja tem conta ENQUANTO se digita, em vez de so no envio. */
export async function checkCpf(cpf: string): Promise<{ valid: boolean; taken: boolean }> {
  return request(`/app/register/check-cpf?cpf=${encodeURIComponent(cpf)}`, { auth: false });
}

/* =============================================================================
   Acesso provisionado — o titular empresta o túnel para a família

   Um plano de 8 não são 8 túneis: é UM túnel que até 8 pessoas usam, com a
   mesma configuração. O titular gera um convite, escolhe por quanto tempo vale
   e mostra o QR; quem escaneia entra no mesmo túnel e ocupa uma vaga.

   O QR carrega um TOKEN, nunca o .conf. É o que torna o gerenciamento possível:
   um QR com a configuração dentro daria acesso permanente a quem fotografasse a
   tela — sem prazo, sem contagem de vaga e sem como revogar, porque a chave
   privada já estaria com a pessoa. Com token quem decide é o servidor a cada
   passo.
   ========================================================================== */

/** Prefixo do QR. Identifica o convite e evita confundir com o QR do .conf. */
export const SHARE_QR_PREFIX = 'tunnelx://share/';

export type ShareDuration = { key: string; label: string; minutes: number | null };

export type ShareSlots = {
  total: number;
  owner: number;
  guests_active: number;
  invites_pending?: number;
  free: number;
  can_share?: boolean;
};

export type ApiShare = {
  id: number;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  guest_label: string | null;
  duration_key: string | null;
  duration_label: string | null;
  expires_at: string | null;
  expires_text: string;
  accepted_at: string | null;
  invite_expires_at: string;
  qr_payload: string | null;
  guest: { id: number; name: string } | null;
  createdAt: string;
};

export type ShareOverview = {
  connection: { id: number; name: string };
  slots: ShareSlots;
  /** As durações vêm do servidor: um app antigo não consegue pedir uma inválida. */
  durations: ShareDuration[];
  invite_ttl_minutes: number;
  shares: ApiShare[];
};

export async function fetchShareOverview(connectionId: number): Promise<ShareOverview> {
  return request<ShareOverview>(`/app/connections/${connectionId}/shares`);
}

export async function createShare(
  connectionId: number,
  duration: string,
  guestLabel?: string
): Promise<{ share: ApiShare; qr_payload: string; invite_expires_at: string; free_slots_after: number }> {
  return request(`/app/connections/${connectionId}/shares`, {
    method: 'POST',
    body: { duration, guest_label: guestLabel || undefined },
  });
}

export async function revokeShare(shareId: number): Promise<{ message: string }> {
  return request(`/app/shares/${shareId}`, { method: 'DELETE' });
}

export type SharePreview = {
  owner_name: string;
  connection_name: string;
  duration_label: string;
  guest_label: string | null;
  invite_expires_at: string;
};

/**
 * O que o convite revela ANTES de entrar na conta.
 *
 * Sem autenticação de propósito: quem escaneou pode ainda não ter conta, e
 * mandar a pessoa se cadastrar sem saber de quem é o convite nem por quanto
 * tempo vale é pedir cadastro a troco de nada.
 */
export async function previewShare(token: string): Promise<SharePreview> {
  return request<SharePreview>(`/app/share/${encodeURIComponent(token)}`, { auth: false });
}

/** Aceita o convite. Exige conta, mas NÃO exige assinatura: o convidado não paga. */
export async function acceptShare(token: string): Promise<{
  message: string;
  share: { id: number; connection_name: string; owner_name: string; expires_at: string | null; expires_text: string };
}> {
  return request(`/app/share/${encodeURIComponent(token)}/accept`, { method: 'POST' });
}

/** O convidado devolve a vaga por conta própria. */
export async function leaveShare(shareId: number): Promise<{ message: string }> {
  return request(`/app/share/${shareId}/leave`, { method: 'DELETE' });
}

/**
 * Extrai o token do que a câmera leu.
 *
 * Aceita o token cru além da URL: um QR reimpresso ou copiado à mão pode chegar
 * sem o prefixo, e recusar isso seria falhar por formatação.
 */
export function parseShareQr(valor: string): string | null {
  const texto = String(valor || '').trim();
  if (texto.startsWith(SHARE_QR_PREFIX)) {
    const token = texto.slice(SHARE_QR_PREFIX.length).trim();
    return token.length >= 16 ? token : null;
  }
  // 64 hexadecimais é o formato que o servidor gera.
  if (/^[0-9a-f]{64}$/i.test(texto)) return texto;
  return null;
}
