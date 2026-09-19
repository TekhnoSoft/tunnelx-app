import type { Tunnel } from '../models/Tunnel';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  FirstAccess: undefined;
  NewPassword: undefined;
  Plans: undefined;
  Checkout: undefined;
  Blocked: undefined;
  Home: { initialTunnels?: Tunnel[] } | undefined;
  TunnelDetail: { tunnel: Tunnel };
  TunnelForm: { tunnel?: Tunnel } | undefined;
  Settings: undefined;
  QRScan: undefined;
  ConfImport: undefined;
};