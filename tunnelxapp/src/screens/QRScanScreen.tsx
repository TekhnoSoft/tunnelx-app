import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import QrScanner from '../components/QrScanner';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';

type Props = { navigation: any };

/**
 * Importar um túnel pelo QR da configuração.
 *
 * É o caminho de quem recebeu um .conf por fora — não tem relação com o acesso
 * provisionado, que usa um convite e vive em ShareInviteScreen.
 */
export default function QRScanScreen({ navigation }: Props) {
  const onCode = useCallback(
    async (texto: string) => {
      try {
        const tunnel = parseWireGuardConf(texto);
        const next = await upsertTunnel(tunnel);
        const conf = toWireGuardConf(tunnel);
        await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf });
        Alert.alert('QR lido', `Túnel "${tunnel.name}" importado.`);
        navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
        return true;
      } catch (e: any) {
        Alert.alert('Falha ao importar do QR', e?.message || 'Erro desconhecido');
        // Rearma o leitor: um QR que não é configuração não pode travar a tela.
        return false;
      }
    },
    [navigation]
  );

  return (
    <QrScanner
      hint="Aponte para o QR com a configuração"
      motivoPermissao="A câmera é usada apenas para ler o QR com a configuração do túnel."
      onCode={onCode}
    />
  );
}
