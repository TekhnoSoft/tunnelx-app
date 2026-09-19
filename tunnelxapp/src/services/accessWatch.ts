import { AppState, type AppStateStatus } from 'react-native';
import { fetchConnectionsState, ApiError } from '../api/client';
import { syncConnections, clearSyncedTunnels, connectionIdOf, isSyncedTunnel } from './sync';
import { loadTunnels } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import type { Tunnel } from '../models/Tunnel';

/**
 * Vigia do acesso — percebe que o titular removeu o convidado.
 *
 * O compartilhamento é revogável a qualquer momento, e sem isto a revogação só
 * valeria no próximo abrir do aplicativo: o convidado continuaria navegando
 * pela conexão de alguém que já o tirou de lá, ocupando uma vaga do plano.
 *
 * Verificação periódica, e não notificação push: não há Firebase neste
 * aplicativo, e montar toda essa infraestrutura para um evento raro custaria
 * muito mais do que uma consulta de algumas centenas de bytes. O endpoint
 * `/app/connections/state` existe justamente para isso — traz só o resumo, sem
 * as configurações.
 *
 * Só roda com o aplicativo em PRIMEIRO PLANO. Em segundo plano não há tela para
 * atualizar, e consultar de fundo gastaria bateria e dados do cliente sem nada
 * em troca; ao voltar, a primeira coisa que ele faz é conferir.
 */

/**
 * De quanto em quanto tempo conferir.
 *
 * Trinta segundos é o equilíbrio: perto o bastante de "na hora" para quem foi
 * removido perder o acesso enquanto ainda está com o telefone na mão, e longe o
 * bastante para a conta de dados ser irrelevante (uma consulta de ~300 bytes a
 * cada 30s dá menos de 1 MB por dia de uso contínuo).
 */
const INTERVALO_MS = 30000;

export type WatchEvent =
  | { tipo: 'mudou'; tunnels: Tunnel[]; removidos: number }
  /** O acesso acabou por completo: sem assinatura e sem convite válido. */
  | { tipo: 'acesso_perdido' };

type Opcoes = {
  onEvento: (e: WatchEvent) => void;
};

/**
 * Começa a vigiar. Devolve a função que para.
 *
 * @param opcoes.onEvento chamado só quando algo MUDOU — consulta sem novidade
 *                        não gera evento, para a tela não se redesenhar à toa.
 */
export function watchAccess({ onEvento }: Opcoes): () => void {
  let vivo = true;
  let revisaoConhecida: string | null = null;
  let conferindo = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** Derruba a VPN e tira da lista tudo que veio da conta. */
  async function cortarTudo() {
    try {
      const estado = await WireGuard.getVpnState();
      if (estado.connected && estado.tunnelId) await WireGuard.stop(estado.tunnelId);
    } catch (e) {
      // Falhar em derrubar não pode impedir a limpeza da lista: deixar o túnel
      // visível seria pior, porque o usuário acharia que ainda tem acesso.
      console.warn('[accessWatch] não foi possível desligar a VPN', e);
    }
    await clearSyncedTunnels();
  }

  async function conferir() {
    // Duas verificações sobrepostas (o intervalo disparando enquanto a anterior
    // ainda responde numa rede lenta) fariam duas sincronizações concorrentes
    // escreverem a mesma lista.
    if (conferindo || !vivo) return;
    conferindo = true;

    try {
      const estado = await fetchConnectionsState();
      if (!vivo) return;

      if (estado.revision === revisaoConhecida) return;

      /*
       * Primeira consulta: confere se o aparelho bate com o servidor.
       *
       * Antes ela só anotava a revisão e ia embora, supondo que a abertura do
       * aplicativo já tinha sincronizado. Quando essa sincronização falhava —
       * ou perdia a corrida contra a montagem da tela — o vigia CONFIRMAVA a
       * lista errada: a revisão ficava registrada, as consultas seguintes não
       * viam mudança nenhuma, e a Home continuava vazia indefinidamente.
       *
       * Comparar com o que está guardado custa uma leitura local e transforma o
       * vigia em rede de segurança, em vez de mais um caminho por onde o erro
       * passa despercebido.
       */
      if (revisaoConhecida === null) {
        revisaoConhecida = estado.revision;

        const locais = new Set(
          (await loadTunnels())
            .filter((t) => isSyncedTunnel(t.id))
            .map((t) => connectionIdOf(t.id))
            .filter((id): id is number => id !== null)
        );

        const bate =
          locais.size === estado.items.length &&
          estado.items.every((i) => locais.has(i.id));

        // Já está tudo no aparelho: não há o que baixar.
        if (bate) return;
      } else {
        revisaoConhecida = estado.revision;
      }

      // Algo mudou — agora sim vale baixar as configurações. É o `sync` que
      // remove o que o servidor não lista mais e derruba o túnel se estiver no ar.
      const r = await syncConnections();
      if (!vivo) return;

      onEvento({ tipo: 'mudou', tunnels: r.tunnels, removidos: r.removed });
    } catch (e: any) {
      if (!vivo) return;

      // 402: o acesso acabou. É resposta legítima do servidor, não falha.
      if (e instanceof ApiError && e.status === 402) {
        await cortarTudo();
        if (vivo) onEvento({ tipo: 'acesso_perdido' });
        return;
      }

      // Qualquer outra falha (sem rede, servidor fora) é silenciosa de
      // propósito: derrubar a VPN de quem está num elevador seria transformar
      // uma oscilação de sinal em perda de acesso.
    } finally {
      conferindo = false;
    }
  }

  timer = setInterval(conferir, INTERVALO_MS);

  // Voltar do segundo plano é o momento mais provável de haver novidade — o
  // telefone pode ter passado horas na tela de bloqueio.
  const aoMudarEstado = (s: AppStateStatus) => {
    if (s === 'active') conferir();
  };
  const inscricao = AppState.addEventListener('change', aoMudarEstado);

  return () => {
    vivo = false;
    if (timer) clearInterval(timer);
    inscricao.remove();
  };
}
