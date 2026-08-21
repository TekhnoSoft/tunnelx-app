import { NativeModules, NativeEventEmitter } from 'react-native';

type ApplyConfigParams = {
  id: string;
  name: string;
  conf: string; // full WireGuard .conf text
};

type WireGuardModuleType = {
  applyConfig: (params: ApplyConfigParams) => Promise<void>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  status: (id: string) => Promise<'up' | 'down' | 'unknown'>;
  prepareVpn?: () => Promise<boolean>;
  isConnected?: () => Promise<boolean>;
};

const NativeWireGuard: WireGuardModuleType | undefined =
  (NativeModules as any)?.WireGuardModule;

const emitter = new NativeEventEmitter((NativeModules as any)?.WireGuardModule);
export const STATUS_EVENT = 'TunnelXVpnStatus';
let jsListeners = new Set<(status: 'connected' | 'disconnected') => void>();
let lastStatus: 'connected' | 'disconnected' | null = null;
let pollTimer: any = null;
function startJsPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const ok = await isConnected();
      const mapped: 'connected' | 'disconnected' = ok ? 'connected' : 'disconnected';
      if (mapped !== lastStatus) {
        lastStatus = mapped;
        jsListeners.forEach(l => l(mapped));
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
export function subscribeStatus(listener: (status: 'connected' | 'disconnected') => void) {
  if (isNativeAvailable()) {
    return emitter.addListener(STATUS_EVENT, listener);
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

export function isNativeAvailable(): boolean {
  return !!NativeWireGuard;
}

export async function prepareVpn(): Promise<boolean> {
  if (!NativeWireGuard || !NativeWireGuard.prepareVpn) return true;
  return NativeWireGuard.prepareVpn();
}
