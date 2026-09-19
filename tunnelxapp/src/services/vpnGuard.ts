import * as WireGuard from '../native/WireGuard';
import { loadTunnels, saveTunnels } from '../storage/tunnels';

/**
 * Derruba o túnel quando o vínculo com a conta deixa de existir.
 *
 * Sessão encerrada e VPN de pé é uma combinação que não pode acontecer: o
 * aparelho continuaria roteando tráfego por uma credencial que o servidor já
 * não reconhece. O caso mais concreto é `SESSION_REPLACED` — a pessoa entra em
 * outro aparelho, este aqui é desconectado, e sem este corte o túnel antigo
 * seguiria ativo indefinidamente, invisível para quem administra a conta.
 *
 * Fica fora de `storage/session.ts` para não misturar camadas, mas é chamado de
 * dentro de `clearSession()`: esse é o único ponto por onde toda saída passa,
 * então nenhum caminho novo pode esquecer de desligar a VPN.
 */
export async function derrubarTunelAtivo(motivo: string): Promise<void> {
  try {
    // A verdade do que está ligado vem do nativo, nunca do modelo persistido:
    // o disco pode estar desatualizado justamente quando mais importa.
    const estado = await WireGuard.getVpnState();
    if (estado.connected && estado.tunnelId) {
      await WireGuard.stop(estado.tunnelId);
    }
  } catch (e) {
    // Falhar aqui não pode impedir a limpeza da sessão — ficar preso logado
    // seria pior. O aviso serve para o caso aparecer no log da extensão.
    console.warn('[vpnGuard] não foi possível desligar a VPN', motivo, e);
  }

  // Apaga o `active` do disco mesmo se o stop falhou: a lista não pode voltar
  // mostrando um túnel como ligado depois que a sessão caiu.
  try {
    const atuais = await loadTunnels();
    if (atuais.some(t => t.active)) {
      await saveTunnels(atuais.map(t => ({ ...t, active: false })));
    }
  } catch {
    // Storage indisponível: o reconcile da Home corrige na próxima abertura.
  }
}
