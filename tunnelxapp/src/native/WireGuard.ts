import { NativeModules, NativeEventEmitter } from 'react-native';

type ApplyConfigParams = {
  id: string;
  name: string;
  conf: string; // texto completo do .conf do WireGuard
};

export type VpnState = 'connected' | 'disconnected' | 'error';
export type VpnStatusEvent = {
  state: VpnState;
  tunnelId: string | null;
  message: string | null;
};

type WireGuardModuleType = {
  applyConfig: (params: ApplyConfigParams) => Promise<void>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  status: (id: string) => Promise<'up' | 'down' | 'unknown'>;
  prepareVpn?: () => Promise<boolean>;
  isConnected?: () => Promise<boolean>;
  getVpnState?: () => Promise<{ connected: boolean; tunnelId: string | null }>;
  getStats?: (id: string) => Promise<{ rxBytes: number; txBytes: number } | null>;
};

const NativeWireGuard: WireGuardModuleType | undefined =
  (NativeModules as any)?.WireGuardModule;

const emitter = new NativeEventEmitter((NativeModules as any)?.WireGuardModule);
export const STATUS_EVENT = 'TunnelXVpnStatus';

/** O nativo passou a emitir um objeto; strings antigas continuam aceitas. */
function normalize(raw: any): VpnStatusEvent {
  if (typeof raw === 'string') {
    return { state: raw as VpnState, tunnelId: null, message: null };
  }
  return {
    state: (raw?.state ?? 'disconnected') as VpnState,
    tunnelId: raw?.tunnelId ?? null,
    message: raw?.message ?? null,
  };
}

// Fallback por polling apenas quando o modulo nativo nao existe (ex.: iOS ainda nao portado).
let jsListeners = new Set<(e: VpnStatusEvent) => void>();
let lastStatus: VpnState | null = null;
let pollTimer: any = null;

function startJsPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const ok = await isConnected();
      const mapped: VpnState = ok ? 'connected' : 'disconnected';
      if (mapped !== lastStatus) {
        lastStatus = mapped;
        jsListeners.forEach(l => l({ state: mapped, tunnelId: null, message: null }));
      }
    } catch {}
  }, 1500);
}

function stopJsPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    lastStatus = null;
  }
}

export function subscribeStatus(listener: (e: VpnStatusEvent) => void) {
  if (isNativeAvailable()) {
    return emitter.addListener(STATUS_EVENT, (raw: any) => listener(normalize(raw)));
  }
  jsListeners.add(listener);
  startJsPolling();
  return {
    remove: () => {
      jsListeners.delete(listener);
      if (jsListeners.size === 0) stopJsPolling();
    },
  };
}

export async function applyConfig(params: ApplyConfigParams): Promise<void> {
  if (!NativeWireGuard) throw new Error('WireGuard native module not linked');
  return NativeWireGuard.applyConfig(params);
}

export async function start(id: string): Promise<void> {
  if (!NativeWireGuard) throw new Error('WireGuard native module not linked');
  return NativeWireGuard.start(id);
}

/** So resolve apos o teardown ter sido VERIFICADO no nativo; rejeita se o tunel seguir de pe. */
export async function stop(id: string): Promise<void> {
  if (!NativeWireGuard) throw new Error('WireGuard native module not linked');
  return NativeWireGuard.stop(id);
}

export async function status(id: string): Promise<'up' | 'down' | 'unknown'> {
  if (!NativeWireGuard) return 'unknown';
  return NativeWireGuard.status(id);
}

export async function isConnected(): Promise<boolean> {
  if (NativeWireGuard && NativeWireGuard.isConnected) return NativeWireGuard.isConnected();
  const st = await status('any');
  return st === 'up';
}

/** Estado real do backend — usar para reconciliar a UI em vez de confiar no disco. */
export async function getVpnState(): Promise<{ connected: boolean; tunnelId: string | null }> {
  if (NativeWireGuard?.getVpnState) return NativeWireGuard.getVpnState();
  return { connected: await isConnected(), tunnelId: null };
}

export function isNativeAvailable(): boolean {
  return !!NativeWireGuard;
}

/** Agora reflete a resposta REAL do dialogo do Android (antes retornava true sempre). */
export async function prepareVpn(): Promise<boolean> {
  if (!NativeWireGuard || !NativeWireGuard.prepareVpn) return true;
  return NativeWireGuard.prepareVpn();
}

/**
 * Bytes realmente trafegados pelo tunel, ou `null` quando nao da para saber.
 *
 * `null` e uma resposta legitima -- sem sessao ativa nao existe medicao. Quem
 * chama deve mostrar traco, nunca zero nem um valor estimado: a tela de detalhe
 * ja exibiu um contador fabricado e isso nao pode voltar.
 */
export async function getStats(id: string): Promise<{ rxBytes: number; txBytes: number } | null> {
  if (!NativeWireGuard?.getStats) return null;
  try {
    return await NativeWireGuard.getStats(id);
  } catch {
    return null;
  }
}

/* =============================================================================
   Vigia de sessão do lado nativo

   O serviço que mantém o túnel de pé continua rodando depois que o app sai do
   recents — e é justamente aí que o JavaScript para. Sem estas credenciais
   guardadas nativamente, uma sessão derrubada em outro aparelho deixaria este
   telefone roteando tráfego por um túnel que ninguém mais autoriza, até alguém
   reabrir o aplicativo.

   Ver android/.../SessionGuard.kt e TunnelKeepAliveService.
   ========================================================================== */

/** Guarda servidor e token para o serviço poder conferir sozinho. */
export async function setSessionGuard(baseUrl: string, token: string): Promise<void> {
  try {
    await (NativeWireGuard as any)?.setSessionGuard?.(baseUrl, token);
  } catch (e) {
    // Reforço de segurança: falhar aqui não pode derrubar o login. O vigia em
    // JavaScript continua cobrindo o app em primeiro plano.
    console.warn('[WireGuard] setSessionGuard falhou', e);
  }
}

export async function clearSessionGuard(): Promise<void> {
  try {
    await (NativeWireGuard as any)?.clearSessionGuard?.();
  } catch (e) {
    console.warn('[WireGuard] clearSessionGuard falhou', e);
  }
}
