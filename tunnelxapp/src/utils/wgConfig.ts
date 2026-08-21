import type { Tunnel } from '../models/Tunnel';

function join(values?: string): string | undefined {
  if (!values) return undefined;
  return values.split(',').map(s => s.trim()).filter(Boolean).join(', ');
}

export function toWireGuardConf(tunnel: Tunnel): string {
  const lines: string[] = [];

  // [Interface]
  lines.push('[Interface]');
  // Session/Name (usado pelo serviço Android para título da sessão)
  if (tunnel.name) lines.push(`Name = ${tunnel.name}`);
  if (tunnel.interface.privateKey) lines.push(`PrivateKey = ${tunnel.interface.privateKey}`);
  if (tunnel.interface.addresses) lines.push(`Address = ${join(tunnel.interface.addresses)}`);
  if (tunnel.interface.listenPort) lines.push(`ListenPort = ${tunnel.interface.listenPort}`);
  if (tunnel.interface.mtu) lines.push(`MTU = ${tunnel.interface.mtu}`);
  if (tunnel.interface.dns) lines.push(`DNS = ${join(tunnel.interface.dns)}`);
  lines.push('');

  // [Peer]
  for (const p of tunnel.peers || []) {
    lines.push('[Peer]');
    lines.push(`PublicKey = ${p.publicKey}`);
    if (p.preSharedKey) lines.push(`PresharedKey = ${p.preSharedKey}`);
    if (p.keepAlive) lines.push(`PersistentKeepalive = ${p.keepAlive}`);
    if (p.allowedIPs) lines.push(`AllowedIPs = ${join(p.allowedIPs)}`);
    if (p.endpoint) lines.push(`Endpoint = ${p.endpoint}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function parseWireGuardConf(rawConf: string): Tunnel {
  let conf = rawConf.trim();
  
  // Handle wg:// scheme
  if (conf.startsWith('wg://')) {
    try {
      conf = decodeURIComponent(conf.slice(5)).trim();
    } catch (e) {
      // If decode fails, proceed with original text or throw? 
      // Better to throw or let the parser fail naturally.
      // Let's assume if it starts with wg:// it MUST be valid uri encoded.
      // However, if decode fails, it might be better to let the parser try to parse it as is (unlikely to work)
      // or throw a specific error.
      // For now, let's just let it throw standard URIError if malformed.
      conf = decodeURIComponent(conf.slice(5)).trim();
    }
  }

  // Remove BOM if present (check again after decoding)
  if (conf.charCodeAt(0) === 0xFEFF) {
    conf = conf.slice(1).trim();
  }

  const iface: Tunnel['interface'] = {};
  const peers: Tunnel['peers'] = [];
  let current: any = null;
  let explicitName: string | undefined;

  const pushPeer = () => {
    if (current && current.type === 'peer') {
      peers.push({
        publicKey: current.publicKey || '',
        preSharedKey: current.preSharedKey,
        keepAlive: current.keepAlive,
        endpoint: current.endpoint,
        allowedIPs: current.allowedIPs,
      });
    }
    current = null;
  };

  conf.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (line.startsWith('[') && line.endsWith(']')) {
      // new section
      pushPeer();
      const section = line.toLowerCase();
      if (section === '[interface]') {
        current = { type: 'interface' };
      } else if (section === '[peer]') {
        current = { type: 'peer' };
      } else {
        current = null;
      }
      return;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) return;
    const key = line.substring(0, eq).trim().toLowerCase();
    const value = line.substring(eq + 1).trim();
    if (current && current.type === 'interface') {
      switch (key) {
        case 'name': explicitName = value; break;
        case 'session': explicitName = value; break;
        case 'privatekey': iface.privateKey = value; break;
        case 'publickey': iface.publicKey = value; break;
        case 'address': iface.addresses = value; break;
        case 'dns': iface.dns = value; break;
        case 'listenport': iface.listenPort = Number(value); break;
        case 'mtu': iface.mtu = Number(value); break;
      }
    } else if (current && current.type === 'peer') {
      switch (key) {
        case 'publickey': current.publicKey = value; break;
        case 'presharedkey': current.preSharedKey = value; break;
        case 'persistentkeepalive': current.keepAlive = Number(value); break;
        case 'endpoint': current.endpoint = value; break;
        case 'allowedips': current.allowedIPs = value; break;
      }
    }
  });
  // push last peer
  pushPeer();

  const id = `tun_${Date.now()}`;
  // Nome amigável: usa host do endpoint do primeiro peer se disponível; senão, o primeiro Address
  const primaryAddr = iface.addresses?.split(',')[0]?.trim();
  const firstPeer = peers[0];
  const rawEndpoint = firstPeer?.endpoint || '';
  let endpointHost: string | undefined;
  if (rawEndpoint.startsWith('[')) {
    const end = rawEndpoint.indexOf(']');
    endpointHost = end > 1 ? rawEndpoint.substring(1, end) : rawEndpoint;
  } else if (rawEndpoint.includes(':')) {
    endpointHost = rawEndpoint.split(':')[0];
  } else {
    endpointHost = rawEndpoint || undefined;
  }
  const name = explicitName ? explicitName : (endpointHost ? `WG ${endpointHost}` : (primaryAddr ? `WG ${primaryAddr}` : `WG ${id.slice(-6)}`));
  return {
    id,
    name,
    interface: iface,
    peers,
    active: false,
    stats: { rxMiB: 0, txMiB: 0 },
  };
}
