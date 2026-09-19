import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  Pressable,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TunnelListItem from '../components/TunnelListItem';
import Screen from '../components/Screen';
import ConnectionOrb from '../components/ConnectionOrb';
import BottomSheet from '../components/BottomSheet';
import ShareSheet from '../components/ShareSheet';
import { isEditableTunnel, type Tunnel } from '../models/Tunnel';
import { saveTunnels, removeTunnel, loadTunnels } from '../storage/tunnels';
import { syncConnections } from '../services/sync';
import { leaveShare } from '../api/client';
import { watchAccess } from '../services/accessWatch';
import * as WireGuard from '../native/WireGuard';
import { toWireGuardConf } from '../utils/wgConfig';
import { Plus, FileArrowDown, QrCode, PencilSimple, ShieldWarning, WarningCircle, CaretRight, ShareNetwork, Clock } from 'phosphor-react-native';
// Importação via arquivo será feita pela tela dedicada (ConfImport)
import { RESULTS, checkNotifications, requestNotifications } from 'react-native-permissions';
import { colors, radius, shadow, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';

type Props = {
  navigation: any;
  initialTunnels?: Tunnel[];
  /**
   * Aviso de cobrança em atraso, durante a carência. Vem pronto do servidor
   * (inclusive quantos dias restam) — o app não recalcula a regra.
   */
  avisoAssinatura?: string | null;
  onResolverPagamento?: () => void;

  /**
   * Usa a conexão de outra pessoa e não tem plano próprio.
   *
   * O convidado tem acesso de verdade — não é um estado degradado, e por isso a
   * faixa convida em vez de alertar. Ele pode seguir assim indefinidamente: quem
   * paga é o titular, e o acesso termina quando o titular quiser ou o prazo
   * vencer. É justamente essa dependência que faz valer a pena oferecer um plano
   * próprio, sem empurrar.
   */
  convidadoDe?: string | null;
  onContratarPlano?: () => void;

  /**
   * O servidor deixou de reconhecer o acesso — em geral porque o titular
   * removeu o convidado, ou porque o prazo do convite venceu.
   *
   * A Home não decide para onde ir: quem roteia é o App, com o veredito novo.
   */
  onAcessoPerdido?: () => void;

  /**
   * Assinatura própria começada e ainda não paga.
   *
   * Sem esta faixa o Pix do convidado ficaria invisível: a tela de pagamento
   * pendente só aparece para quem está SEM acesso, e o convidado tem acesso pelo
   * convite. Ele geraria o código, fecharia o app e não encontraria mais o
   * caminho de volta.
   */
  pagamentoPendente?: boolean;
  onRetomarPagamento?: () => void;
};

export default function HomeScreen({
  navigation,
  initialTunnels = [],
  avisoAssinatura,
  onResolverPagamento,
  convidadoDe,
  onContratarPlano,
  onAcessoPerdido,
  pagamentoPendente,
  onRetomarPagamento,
}: Props) {
  const [tunnels, setTunnels] = useState<Tunnel[]>(initialTunnels);

  /*
   * A prop `initialTunnels` continua mandando DEPOIS da montagem.
   *
   * Era só estado inicial, e isso deixava a Home vazia numa corrida real: o App
   * libera o acesso assim que o servidor responde e só então sincroniza. A Home
   * montava no meio, lia a lista vazia do armazenamento e nunca mais olhava —
   * o `useFocusEffect` já tinha rodado, e a prop nova era ignorada porque
   * `useState(x)` só usa `x` no primeiro render.
   *
   * Aparecia mais no convidado porque o caminho dele é mais longo (aceitar o
   * convite antes de consultar o acesso), mas o titular perdia a mesma corrida
   * quando o servidor demorava a responder.
   */
  useEffect(() => {
    if (initialTunnels.length) setTunnels(initialTunnels);
  }, [initialTunnels]);
  const [showSheet, setShowSheet] = useState(false);
  // Qual túnel está com a folha de compartilhamento aberta. Guardar o túnel, e
  // não só um booleano, evita a folha piscar com os dados do anterior.
  const [compartilhando, setCompartilhando] = useState<Tunnel | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const m = useLayout();
  // activeId: qual tunel o NATIVO diz estar ativo. busy: transicao em andamento.
  const [activeId, setActiveId] = useState<string | null>(null);
  const busy = useRef(false);
  // Espelho do `busy` em estado: o ref sozinho nao re-renderiza, entao a UI
  // ficava sem indicar que havia uma transicao em curso.
  const [transicionando, setTransicionando] = useState(false);

  /*
   * Vigia o acesso enquanto a Home está montada.
   *
   * É aqui que a remoção feita pelo titular chega ao convidado: sem isto ele
   * continuaria usando a conexão até reabrir o aplicativo. O aviso é explícito
   * porque o túnel some da lista e a VPN cai — sem explicação, pareceria defeito.
   */
  useEffect(() => {
    const parar = watchAccess({
      onEvento: (e) => {
        if (e.tipo === 'acesso_perdido') {
          Alert.alert(
            'Acesso encerrado',
            'Sua conexão compartilhada foi encerrada pelo titular ou o prazo terminou.'
          );
          onAcessoPerdido?.();
          return;
        }

        setTunnels(e.tunnels);
        if (e.removidos > 0) {
          Alert.alert(
            e.removidos === 1 ? 'Conexão removida' : 'Conexões removidas',
            e.removidos === 1
              ? 'Uma conexão que você usava não está mais disponível. Se era compartilhada, o titular encerrou o acesso.'
              : `${e.removidos} conexões que você usava não estão mais disponíveis.`
          );
        }
      },
    });
    return parar;
  }, [onAcessoPerdido]);

  // Recarrega ao focar a Home para refletir inclusões/edições/exclusões
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const latest = await loadTunnels();
        // Só sobrescreve com vazio se o disco realmente estiver vazio E não
        // houver nada em memória: senão um foco disparado no meio do sync
        // limparia a lista que acabou de chegar.
        if (!active) return;
        setTunnels(prev => (latest.length === 0 && prev.length > 0 ? prev : latest));
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  // Estado da VPN: a VERDADE vem do backend nativo, nunca do modelo persistido.
  //
  // O bloco anterior tinha um polling de 1,5s que chamava WireGuard.stop() por conta
  // propria quando achava que todos os tuneis estavam inativos. Desligar VPN e acao do
  // usuario, jamais efeito colateral de timer. Ele tambem usava uma heuristica de
  // "trafego" alimentada por bytes falsos que a tela de detalhe incrementava sozinha.
  useEffect(() => {
    const sub = WireGuard.subscribeStatus((e) => {
      setConnected(e.state === 'connected');
      setActiveId(e.state === 'connected' ? e.tunnelId : null);
      if (e.state === 'error') {
        Alert.alert('VPN', e.message ?? 'Falha na operação de VPN. O túnel pode continuar ativo.');
      }
    });

    const reconcile = async () => {
      try {
        const st = await WireGuard.getVpnState();
        setConnected(st.connected);
        setActiveId(st.tunnelId);
        /*
         * NÃO persistir aqui.
         *
         * Este bloco gravava `saveTunnels(prev)` a cada 3s — e também no
         * primeiro disparo, quando `prev` ainda é a semente `initialTunnels`.
         * Se o reconcile vencesse a corrida contra o `loadTunnels()` do
         * useFocusEffect, ele escrevia `[]` por cima da lista que o sync tinha
         * acabado de salvar; o foco então relia vazio e o timer regravava vazio
         * a cada 3s, tornando a perda permanente.
         *
         * No iOS a corrida é fácil de perder: `getVpnState()` cai em
         * `loadAllFromPreferences`, que retorna quase imediatamente quando
         * nenhuma VPN está provisionada.
         *
         * `active` é estado de execução: o próprio reconcile o recalcula a cada
         * ciclo a partir do nativo, então não há nada que precise sobreviver ao
         * fechamento do app.
         */
        setTunnels(prev => prev.map(t => ({ ...t, active: st.connected && t.id === st.tunnelId })));
      } catch {}
    };

    reconcile();
    const timerId = setInterval(reconcile, 3000);
    return () => { sub.remove(); clearInterval(timerId); };
  }, []);

  useEffect(() => {
    const pedirNotificacoes = async () => {
      try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const has = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          if (!has) {
            const res = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: 'Permissão de Notificações',
                message: 'Precisamos de notificações para manter a sessão VPN visível e estável.',
                buttonPositive: 'Permitir',
                buttonNegative: 'Agora não',
              }
            );
            if (res !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert('Notificações desativadas', 'Sem notificações, a sessão VPN pode não mostrar o status corretamente.');
            }
          }
        }
      } catch {}
    };
    pedirNotificacoes();
  }, []);

  const onToggle = async (tun: Tunnel) => {
    // Guarda de reentrancia: o switch nao pode disparar duas transicoes concorrentes
    // sobre o mesmo TUN.
    if (busy.current) return;
    busy.current = true;
    setTransicionando(true);
    const enable = !tun.active;
    try {
      if (enable) {
        if (Platform.OS === 'android') {
          try {
            const { status } = await checkNotifications();
            if (status !== RESULTS.GRANTED && status !== RESULTS.LIMITED) {
              await requestNotifications(['alert', 'sound', 'badge']);
            }
          } catch {}
        }

        // prepareVpn agora devolve a resposta real do dialogo do Android.
        const granted = await WireGuard.prepareVpn();
        if (!granted) {
          Alert.alert('Permissão de VPN', 'A permissão do Android é necessária para ativar o túnel.');
          return;
        }

        await WireGuard.applyConfig({ id: tun.id, name: tun.name, conf: toWireGuardConf(tun) });
        await WireGuard.start(tun.id); // so resolve com o tunel realmente UP

        // Um unico tunel ativo por vez: subir B derruba A (o VpnManager ja fez isso).
        const updated = tunnels.map(t => ({ ...t, active: t.id === tun.id }));
        setTunnels(updated);
        await saveTunnels(updated).catch(() => {});
        setConnected(true);
        setActiveId(tun.id);
      } else {
        await WireGuard.stop(tun.id); // so resolve apos o teardown VERIFICADO
        const updated = tunnels.map(t => ({ ...t, active: false }));
        setTunnels(updated);
        await saveTunnels(updated).catch(() => {});
        setConnected(false);
        setActiveId(null);
      }
    } catch (e: any) {
      // Nunca chutar o estado: perguntar ao nativo qual e a verdade.
      let real: { connected: boolean; tunnelId: string | null } = { connected: false, tunnelId: null };
      try { real = await WireGuard.getVpnState(); } catch {}
      const repaired = tunnels.map(t => ({ ...t, active: real.connected && t.id === real.tunnelId }));
      setTunnels(repaired);
      await saveTunnels(repaired).catch(() => {});
      setConnected(real.connected);
      setActiveId(real.tunnelId);

      if (e?.code === 'E_NEEDS_PREPARE') {
        Alert.alert('Permissão necessária', 'Conceda a permissão de VPN do Android e tente novamente.');
      } else if (!enable) {
        Alert.alert(
          'Falha ao desconectar',
          `${e?.message ?? 'Erro desconhecido'}\n\nO túnel pode continuar ativo. Tente novamente.`
        );
      } else {
        Alert.alert('Falha na conexão', e?.message ?? 'Erro desconhecido ao tentar conectar.');
      }
    } finally {
      busy.current = false;
      setTransicionando(false);
    }
  };

  /**
   * O orbe liga/desliga o tunel obvio: o ativo, quando ha um, ou o primeiro da
   * lista. Nao inventa logica de VPN -- chama o MESMO onToggle da chave.
   */
  const alvoDoOrbe = (): Tunnel | undefined =>
    (connected && activeId ? tunnels.find(t => t.id === activeId) : undefined) ?? tunnels[0];

  const onOrbe = () => {
    const alvo = alvoDoOrbe();
    if (!alvo) {
      setShowSheet(true);
      return;
    }
    onToggle(alvo);
  };

  const onPress = (tun: Tunnel) => {
    // O túnel do plano abre em visualização — é dele, só não é editável. O
    // emprestado não abre: a chave e o endpoint são de outra pessoa.
    if (tun.origin?.shared) return;
    navigation.navigate('TunnelDetail', { tunnel: tun });
  };

  const onCreateFromFile = async () => {
    setShowSheet(false);
    navigation.navigate('ConfImport');
  };

  const onReadQR = () => {
    setShowSheet(false);
    navigation.navigate('QRScan');
  };

  const onCreateFromScratch = () => {
    setShowSheet(false);
    navigation.navigate('TunnelForm');
  };

  /*
   * Recarrega a ocupação depois de convidar ou remover alguém.
   *
   * As vagas vivem no servidor e chegam junto das conexões; sem uma nova
   * sincronização, o card continuaria mostrando o número de antes e o usuário
   * acharia que a ação não pegou.
   */
  const atualizarVagas = useCallback(async () => {
    try {
      const r = await syncConnections();
      setTunnels(r.tunnels);
    } catch {
      // Falha de rede aqui não pode derrubar a folha: o convite já foi criado
      // no servidor, e a lista se corrige sozinha na próxima abertura.
    }
  }, []);

  /*
   * Excluir — só faz sentido em túnel próprio.
   *
   * O card do túnel emprestado nem mostra o botão (ver TunnelListItem), mas a
   * guarda fica aqui também: apagar um túnel de outra pessoa só o tiraria deste
   * aparelho, enquanto o convite seguiria ativo ocupando a vaga do plano do
   * titular — e a próxima sincronização traria o túnel de volta. Quem encerra o
   * acesso é o titular, ou o prazo do convite.
   */
  const onExcluir = useCallback((t: Tunnel) => {
    // Vale para os dois casos: emprestado (é de outra pessoa) e do plano (o
    // servidor continua cobrando e a próxima sincronização o traz de volta).
    // O botão já nasce desabilitado; a guarda impede qualquer outro caminho.
    if (!isEditableTunnel(t)) return;

    Alert.alert('Excluir túnel', `Deseja excluir "${t.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setTunnels(await removeTunnel(t.id));
        },
      },
    ]);
  }, []);

  /*
   * Sair de uma conexão provisionada.
   *
   * Desfaz o vínculo no SERVIDOR — é isso que devolve a vaga ao plano do
   * titular e libera a pessoa para aceitar outro convite. Depois sincroniza: o
   * túnel some da lista porque o servidor deixa de listá-lo, e não porque o app
   * o apagou por conta própria.
   */
  const onSair = useCallback(async (t: Tunnel) => {
    const shareId = t.origin?.shareId;
    if (!shareId) return;

    const dono = t.origin?.ownerName || 'o titular';
    Alert.alert(
      'Sair desta conexão',
      `Você deixará de usar a conexão de ${dono} e a vaga ficará livre. Para voltar, será preciso um convite novo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveShare(shareId);
            } catch (e: any) {
              // O titular pode ter revogado antes. O vínculo já não existe, e
              // sincronizar abaixo resolve do mesmo jeito.
              console.warn('[Home] falha ao sair da conexão compartilhada', e);
            }
            try {
              const r = await syncConnections();
              setTunnels(r.tunnels);
            } catch {
              // Sem rede: tira da lista local para a tela não mentir. A próxima
              // sincronização reconcilia com o servidor.
              setTunnels(await removeTunnel(t.id));
            }
          },
        },
      ]
    );
  }, []);

  const renderItem = ({ item }: { item: Tunnel }) => (
    <TunnelListItem
      tunnel={item}
      isActive={connected && activeId === item.id}
      busy={transicionando}
      onToggle={onToggle}
      onPress={onPress}
      onEdit={(t) => {
        // Editar um túnel do plano escreveria numa configuração que o
        // provisionador reescreve na sincronização seguinte.
        if (!isEditableTunnel(t)) return;
        navigation.navigate('TunnelForm', { tunnel: t });
      }}
      onShare={(t) => setCompartilhando(t)}
      onLeave={onSair}
      onDelete={onExcluir}
    />
  );

  const alvo = alvoDoOrbe();

  const cabecalho = (
    <View style={styles.topo}>
      {/* Faixa de atraso: aparece durante a carência, antes do bloqueio. É a
          última chance de resolver sem perder o acesso, então fica no topo da
          Home e não escondida em Definições. */}
      {avisoAssinatura ? (
        <Pressable
          onPress={onResolverPagamento}
          style={({ pressed }) => [styles.faixaAviso, pressed && { opacity: 0.85 }]}
        >
          <WarningCircle size={18} color="#92400E" weight="duotone" />
          <Text style={styles.faixaAvisoTexto}>{avisoAssinatura}</Text>
          <CaretRight size={14} color="#92400E" />
        </Pressable>
      ) : null}

      {/* Pagamento em aberto de um plano PRÓPRIO. Vem antes do convite: quem já
          começou a assinar não precisa ver a oferta de novo. */}
      {pagamentoPendente ? (
        <Pressable
          onPress={onRetomarPagamento}
          style={({ pressed }) => [styles.faixaPix, pressed && { opacity: 0.85 }]}
        >
          <Clock size={18} color={colors.primary} weight="duotone" />
          <Text style={styles.faixaPixTexto}>
            Seu plano está aguardando o pagamento. Toque para retomar.
          </Text>
          <CaretRight size={14} color={colors.primary} />
        </Pressable>
      ) : convidadoDe ? (
        <Pressable
          onPress={onContratarPlano}
          style={({ pressed }) => [styles.faixaConvite, pressed && { opacity: 0.85 }]}
        >
          <ShareNetwork size={18} color={colors.greenInk} weight="duotone" />
          <View style={styles.faixaConviteTextos}>
            <Text style={styles.faixaConviteTitulo}>
              Você usa a conexão de {convidadoDe}
            </Text>
            <Text style={styles.faixaConviteTexto}>
              Quer a sua, sem depender de ninguém? Veja os planos.
            </Text>
          </View>
          <CaretRight size={14} color={colors.greenInk} />
        </Pressable>
      ) : null}

      <ConnectionOrb
        connected={connected}
        busy={transicionando}
        size={m.orb}
        subtitle={
          connected
            ? alvo?.name ?? 'Túnel ativo'
            : alvo
            ? `Pronto: ${alvo.name}`
            : 'Nenhum túnel instalado'
        }
        onPress={onOrbe}
      />

      {tunnels.length ? (
        <View style={styles.tituloLista}>
          <Text style={styles.tituloListaTexto}>Meus túneis</Text>
          <View style={styles.contador}>
            <Text style={styles.contadorTexto}>{tunnels.length}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen variant={connected ? 'live' : 'idle'}>
      {/* paddingBottom: espaco para o ultimo item nao ficar sob o FAB nem sob a barra de navegacao */}
      <FlatList
        data={tunnels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={cabecalho}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: m.gutter,
          paddingTop: m.paddingTop,
          paddingBottom: m.insets.bottom + 112,
        }}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <ShieldWarning size={40} color={colors.textDim} weight="duotone" />
            <Text style={styles.emptyTitulo}>Nenhum túnel por aqui</Text>
            <Text style={styles.emptyTexto}>
              Toque no botão ＋ para importar um arquivo .conf, ler um QR ou criar do zero.
            </Text>
          </View>
        )}
      />

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: m.insets.bottom + spacing.xl, right: m.gutter },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        onPress={() => setShowSheet(true)}
        accessibilityRole="button"
        accessibilityLabel="Adicionar túnel"
      >
        <View style={styles.fabAro} />
        <Plus size={26} color="#fff" weight="bold" />
      </Pressable>

      {/* Folha de compartilhamento: própria, e não uma opção dentro da de
          "Adicionar túnel", porque ela pertence a UM túnel — o que foi tocado.
          Montada só quando há alvo, para não carregar as vagas do servidor de
          um túnel que ninguém abriu. */}
      <BottomSheet
        visible={!!compartilhando}
        onClose={() => setCompartilhando(null)}
      >
        {compartilhando ? (
          <ShareSheet
            connectionId={compartilhando.origin?.connectionId ?? 0}
            connectionName={compartilhando.name}
            onChanged={atualizarVagas}
            onClose={() => setCompartilhando(null)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        title="Adicionar túnel"
      >
        <SheetOption
          icon={<FileArrowDown size={20} color={colors.primary} weight="duotone" />}
          title="Criar a partir de um arquivo"
          desc="Importar um .conf do aparelho"
          onPress={onCreateFromFile}
        />
        <SheetOption
          icon={<QrCode size={20} color={colors.greenInk} weight="duotone" />}
          title="Ler código QR"
          desc="Apontar a câmera para a configuração"
          onPress={onReadQR}
        />
        <SheetOption
          icon={<PencilSimple size={20} color={colors.primary} weight="duotone" />}
          title="Criar do zero"
          desc="Preencher interface e pares à mão"
          onPress={onCreateFromScratch}
        />
      </BottomSheet>
    </Screen>
  );
}

function SheetOption({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
      // Ripple nativo: confirma o toque no instante em que ele acontece, sem
      // esperar a tela seguinte montar.
      android_ripple={{ color: 'rgba(19,86,193,0.12)' }}
    >
      <View style={styles.optionIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionText}>{title}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topo: { paddingTop: spacing.md },
  faixaAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  faixaAvisoTexto: { ...type.small, color: '#92400E', flex: 1, lineHeight: 18 },

  // Verde, e não âmbar: o convidado não tem problema nenhum a resolver.
  faixaConvite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.greenSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.green,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  faixaConviteTextos: { flex: 1 },
  faixaConviteTitulo: { ...type.small, color: colors.text, fontWeight: '700' },
  faixaConviteTexto: { ...type.tiny, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

  faixaPix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  faixaPixTexto: { ...type.small, color: colors.text, flex: 1, lineHeight: 18 },
  tituloLista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  tituloListaTexto: { ...type.label, color: colors.textDim },
  contador: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  contadorTexto: { ...type.tiny, color: colors.textMuted },

  empty: { alignItems: 'center', marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitulo: { ...type.heading, color: colors.textMuted, marginTop: spacing.md },
  emptyTexto: {
    ...type.small,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  // Aro translúcido em volta do FAB: o halo que o Android não desenha via
  // shadowColor, feito à mão.
  fabAro: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    // surfaceAlt, nao surface: estes quadrados ficam SOBRE card branco, e
    // branco no branco sumiria.
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { ...type.body, color: colors.text },
  optionDesc: { ...type.tiny, color: colors.textDim, marginTop: 2, fontWeight: '500' },
});
