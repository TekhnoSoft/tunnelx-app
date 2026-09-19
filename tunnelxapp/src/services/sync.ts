import { fetchConnections, type ApiConnection } from '../api/client';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { loadTunnels, saveTunnels } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import type { Tunnel, TunnelOrigin } from '../models/Tunnel';

/**
 * Traz para o aparelho as conexões da conta.
 *
 * Antes disso o único caminho era o cliente receber um arquivo .conf ou um QR
 * por fora e importar na mão. Agora quem entra com CPF e senha já encontra os
 * túneis prontos.
 */

/**
 * O id do túnel deriva do id da conexão, e não do relógio.
 *
 * `parseWireGuardConf` gera `tun_<timestamp>`: sincronizar duas vezes criaria
 * duas cópias do mesmo túnel. Amarrando o id à conexão, a segunda sincronização
 * ATUALIZA a primeira — que é exatamente o que precisa acontecer quando o
 * operador reprovisiona e o Endpoint muda.
 */
export function tunnelIdFor(connectionId: number): string {
  return `tunnelx_conn_${connectionId}`;
}

export function isSyncedTunnel(id: string): boolean {
  return id.startsWith('tunnelx_conn_');
}

export type SyncResult = {
  imported: number;
  pending: number;
  /** Túneis que sumiram do servidor e foram tirados do aparelho. */
  removed: number;
  failed: { name: string; reason: string }[];
  tunnels: Tunnel[];
};

function nameFor(conn: ApiConnection): string {
  // Túnel emprestado: o nome útil é o de quem emprestou. O nome do plano seria
  // o do titular, e na lista do convidado ele apareceria como se fosse dele.
  if (conn.shared && conn.owner_name) return `Túnel de ${conn.owner_name}`;

  // O `name` da conexão é o nome do cliente — repetido em todas as conexões
  // dele. Com duas ou mais, a lista fica com itens idênticos e nenhum jeito de
  // saber qual é qual; o plano diferencia.
  const plano = conn.plan?.name;
  return plano ? `${plano} (#${conn.id})` : `Conexão #${conn.id}`;
}

/** Metadados da conta que a lista usa, mas o WireGuard não conhece. */
function originFor(conn: ApiConnection): TunnelOrigin {
  if (conn.shared) {
    return {
      connectionId: conn.id,
      shared: true,
      ownerName: conn.owner_name,
      shareId: conn.share_id,
      expiresText: conn.expires_text,
      slots: null,
    };
  }
  return {
    connectionId: conn.id,
    shared: false,
    slots: conn.slots
      ? {
          total: conn.slots.total,
          guests_active: conn.slots.guests_active,
          free: conn.slots.free,
          can_share: !!conn.slots.can_share,
        }
      : null,
  };
}

/** Caminho inverso de `tunnelIdFor`: da lista local de volta para a conexão. */
export function connectionIdOf(tunnelId: string): number | null {
  if (!isSyncedTunnel(tunnelId)) return null;
  const n = Number(tunnelId.slice('tunnelx_conn_'.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function syncConnections(): Promise<SyncResult> {
  const conexoes = await fetchConnections();

  const atuais = await loadTunnels();
  const porId = new Map(atuais.map(t => [t.id, t]));

  const resultado: SyncResult = { imported: 0, pending: 0, removed: 0, failed: [], tunnels: atuais };

  for (const conn of conexoes) {
    if (!conn.ready || !conn.config) {
      // Conexão comprada e ainda na fila do provisionador. Não é erro.
      resultado.pending += 1;
      continue;
    }

    const id = tunnelIdFor(conn.id);

    try {
      const parsed = parseWireGuardConf(conn.config);
      const anterior = porId.get(id);

      const tunnel: Tunnel = {
        ...parsed,
        id,
        name: nameFor(conn),
        // Estado de execução é do aparelho, não do servidor: um túnel que já
        // estava ativo não pode aparecer como inativo só porque sincronizou.
        active: anterior?.active ?? false,
        stats: anterior?.stats ?? { rxMiB: 0, txMiB: 0 },
        origin: originFor(conn),
      };

      porId.set(id, tunnel);

      // O nativo precisa receber o .conf reserializado — é dele que o serviço
      // Android monta a sessão.
      await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf: toWireGuardConf(tunnel) });

      resultado.imported += 1;
    } catch (e: any) {
      // Uma conexão com defeito não pode impedir a importação das outras.
      resultado.failed.push({ name: nameFor(conn), reason: e?.message || 'falha desconhecida' });
    }
  }

  /*
   * O que o servidor não lista mais sai do aparelho.
   *
   * Sem isto a sincronização só somava, e a revogação não valia nada: o titular
   * tirava o convidado, o servidor parava de mandar aquele túnel, e ele
   * continuava na lista do convidado — com a configuração em cache, ainda
   * funcionando. O mesmo valia para uma conexão excluída no painel.
   *
   * Só mexe no que veio da conta (`isSyncedTunnel`). Túnel importado à mão, por
   * arquivo ou QR do .conf, é do usuário: o servidor nunca soube dele e não tem
   * autoridade para apagá-lo.
   *
   * Um túnel removido enquanto está ligado é derrubado antes de sair da lista —
   * caso contrário o acesso cortado continuaria de pé até o aparelho reiniciar.
   */
  const noServidor = new Set(conexoes.map((c) => tunnelIdFor(c.id)));

  for (const t of atuais) {
    if (!isSyncedTunnel(t.id) || noServidor.has(t.id)) continue;

    try {
      if ((await WireGuard.status(t.id)) === 'up') await WireGuard.stop(t.id);
    } catch (e) {
      // Falhar em derrubar não pode impedir a remoção da lista.
      console.warn('[sync] não foi possível desligar o túnel removido', t.id, e);
    }

    porId.delete(t.id);
    resultado.removed += 1;
  }

  const proximos = Array.from(porId.values());
  await saveTunnels(proximos);
  resultado.tunnels = proximos;

  return resultado;
}

/**
 * Remove do aparelho os túneis que vieram da conta, preservando os importados
 * à mão por QR ou arquivo — esses são do usuário, não da assinatura.
 */
export async function clearSyncedTunnels(): Promise<Tunnel[]> {
  const atuais = await loadTunnels();
  const mantidos = atuais.filter(t => !isSyncedTunnel(t.id));
  await saveTunnels(mantidos);
  return mantidos;
}
