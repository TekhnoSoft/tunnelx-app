export type Peer = {
  publicKey: string;
  preSharedKey?: string;
  keepAlive?: number; // seconds
  endpoint?: string; // host:port
  allowedIPs?: string; // comma separated
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
};