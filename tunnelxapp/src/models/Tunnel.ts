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