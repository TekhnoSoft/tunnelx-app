export type Peer = {
  publicKey: string;
  preSharedKey?: string;
  keepAlive?: number; // seconds
  endpoint?: string; // host:port
  allowedIPs?: string; // comma separated
};

/**
 * De onde veio este túnel, quando veio da conta.
 *
 * Túnel importado à mão (arquivo ou QR do .conf) não tem origem: ele não
 * pertence a nenhuma assinatura e o app não sabe nada sobre ele. Só os
 * sincronizados carregam isto, e é o que permite a lista mostrar "compartilhado
 * por Dyllan" e oferecer o botão de compartilhar apenas a quem é titular.
 */
export type TunnelOrigin = {
  connectionId: number;
  /** false = do próprio cliente; true = alguém emprestou. */
  shared: boolean;
  /** Vagas do plano. Só em túnel próprio — ninguém administra túnel alheio. */
  slots?: {
    total: number;
    guests_active: number;
    free: number;
    can_share: boolean;
  } | null;
  /** Só em túnel emprestado: quem emprestou e até quando vale. */
  ownerName?: string;
  shareId?: number;
  expiresText?: string;
};

export type Tunnel = {
  id: string;
  name: string;
  interface: {
    privateKey?: string;
    publicKey?: string;
    addresses?: string; // e.g. 192.168.4.140/24
    dns?: string; // comma separated
    listenPort?: number;
    mtu?: number;
  };
  peers: Peer[];
  active: boolean;
  stats?: { rxMiB: number; txMiB: number };
  /** Presente só em túnel vindo da conta. Ver TunnelOrigin. */
  origin?: TunnelOrigin;
};

/* ---------------------------------------------------------------------------
   O formato do id, e o que ele significa

   Estas três funções são fatos sobre a STRING do id, sem dependência de rede
   nem de módulo nativo — por isso moram aqui, e não em services/sync. Um item
   de lista precisa saber se o túnel veio da conta para decidir se oferece
   editar e excluir, e não pode arrastar o WireGuard e o cliente HTTP junto só
   para responder isso.

   O prefixo é também o sinal mais confiável que existe: túneis sincronizados
   por versões antigas do aplicativo estão gravados sem o campo `origin`, mas o
   id sempre teve este formato.
--------------------------------------------------------------------------- */

const PREFIXO_SINCRONIZADO = 'tunnelx_conn_';

/**
 * O id do túnel deriva do id da conexão, e não do relógio.
 *
 * `parseWireGuardConf` gera `tun_<timestamp>`: sincronizar duas vezes criaria
 * duas cópias do mesmo túnel. Amarrando o id à conexão, a segunda sincronização
 * ATUALIZA a primeira — que é exatamente o que precisa acontecer quando o
 * operador reprovisiona e o Endpoint muda.
 */
export function tunnelIdFor(connectionId: number): string {
  return `${PREFIXO_SINCRONIZADO}${connectionId}`;
}

/** Veio da conta (assinatura ou convite), e não de uma importação à mão. */
export function isSyncedTunnel(id: string): boolean {
  return id.startsWith(PREFIXO_SINCRONIZADO);
}

/** Caminho inverso de `tunnelIdFor`: da lista local de volta para a conexão. */
export function connectionIdOf(tunnelId: string): number | null {
  if (!isSyncedTunnel(tunnelId)) return null;
  const n = Number(tunnelId.slice(PREFIXO_SINCRONIZADO.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * O usuário pode editar ou excluir este túnel?
 *
 * Só o que ele mesmo importou pelo botão +. O que vem do plano é gerado pelo
 * provisionador e reescrito a cada sincronização: editar seria escrever numa
 * folha que o servidor rasura em seguida, e excluir tiraria da lista um túnel
 * que continua sendo cobrado e que volta na sincronização seguinte.
 */
export function isEditableTunnel(t: Tunnel): boolean {
  return !t.origin && !isSyncedTunnel(t.id);
}
