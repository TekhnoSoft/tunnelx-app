import type { Tunnel } from '../models/Tunnel';

export type RootStackParamList = {
  Splash: undefined;
  /** Declaracao de dados da VPN, exigida pela diretriz 5.4 antes de usar o servico. */
  VpnDisclosure: undefined;
  Login: undefined;
  Register: undefined;
  NewPassword: undefined;
  Plans: undefined;
  Checkout: undefined;
  Blocked: undefined;
  PendingPix: undefined;
  Home: { initialTunnels?: Tunnel[] } | undefined;
  TunnelDetail: { tunnel: Tunnel };
  TunnelForm: { tunnel?: Tunnel } | undefined;
  Settings: undefined;
  QRScan: undefined;
  ShareInvite: undefined;
  ConfImport: undefined;
};