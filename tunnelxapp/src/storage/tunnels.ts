import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Tunnel } from '../models/Tunnel';

const KEY = 'tunnelx:tunnels';

export async function loadTunnels(): Promise<Tunnel[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    // Normalize legacy records that used a single `peer` field
    const normalized: Tunnel[] = parsed.map((t: any) => {
      if (t && !t.peers) {
        const peers = t.peer ? [t.peer] : [];
        const rest: any = { ...t };
        delete rest.peer;
        return { ...rest, peers } as Tunnel;
      }
      return t as Tunnel;
    });
    return normalized;
  } catch {
    return [];
  }
}

export async function saveTunnels(tunnels: Tunnel[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(tunnels));
}

export async function upsertTunnel(next: Tunnel): Promise<Tunnel[]> {
  const tunnels = await loadTunnels();
  const idx = tunnels.findIndex(t => t.id === next.id);
  if (idx >= 0) tunnels[idx] = next; else tunnels.push(next);
  await saveTunnels(tunnels);
  return tunnels;
}

export async function removeTunnel(id: string): Promise<Tunnel[]> {
  const tunnels = await loadTunnels();
  const filtered = tunnels.filter(t => t.id !== id);
  await saveTunnels(filtered);
  return filtered;
}
