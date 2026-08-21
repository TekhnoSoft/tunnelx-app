import type { Tunnel } from '../models/Tunnel';

export type RootStackParamList = {
  Splash: undefined;
  Home: { initialTunnels?: Tunnel[] } | undefined;
  TunnelDetail: { tunnel: Tunnel };
  TunnelForm: { tunnel?: Tunnel } | undefined;
  Settings: undefined;
  QRScan: undefined;
  ConfImport: undefined;
};