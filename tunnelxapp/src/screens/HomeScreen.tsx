import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  Modal,
  Pressable,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import TunnelListItem from '../components/TunnelListItem';
import Screen from '../components/Screen';
import ConnectionOrb from '../components/ConnectionOrb';
import type { Tunnel } from '../models/Tunnel';
import { saveTunnels, removeTunnel, loadTunnels } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import { toWireGuardConf } from '../utils/wgConfig';
import { Plus, FileArrowDown, QrCode, PencilSimple, ShieldWarning } from 'phosphor-react-native';
// Importação via arquivo será feita pela tela dedicada (ConfImport)
import { RESULTS, checkNotifications, requestNotifications } from 'react-native-permissions';
import { colors, radius, shadow, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';

type Props = {
  navigation: any;
  initialTunnels?: Tunnel[];
};

export default function HomeScreen({ navigation, initialTunnels = [] }: Props) {
  const [tunnels, setTunnels] = useState<Tunnel[]>(initialTunnels);
  const [showSheet, setShowSheet] = useState(false);
  const [connected, setConnected] = useState<boolean>(false);
  const m = useLayout();
  // activeId: qual tunel o NATIVO diz estar ativo. busy: transicao em andamento.
  const [activeId, setActiveId] = useState<string | null>(null);
  const busy = useRef(false);
  // Espelho do `busy` em estado: o ref sozinho nao re-renderiza, entao a UI
  // ficava sem indicar que havia uma transicao em curso.
  const [transicionando, setTransicionando] = useState(false);

  // Recarrega ao focar a Home para refletir inclusões/edições/exclusões
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const latest = await loadTunnels();
        if (active) setTunnels(latest);
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
        setTunnels(prev => {
          const fixed = prev.map(t => ({ ...t, active: st.connected && t.id === st.tunnelId }));
          saveTunnels(fixed).catch(() => {});
          return fixed;
        });
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

  const renderItem = ({ item }: { item: Tunnel }) => (
    <TunnelListItem
      tunnel={item}
      isActive={connected && activeId === item.id}
      busy={transicionando}
      onToggle={onToggle}
      onPress={onPress}
      onEdit={(t) => navigation.navigate('TunnelForm', { tunnel: t })}
      onDelete={(t) => {
        Alert.alert('Excluir túnel', `Deseja excluir "${t.name}"?`, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir', style: 'destructive', onPress: async () => {
              const next = await removeTunnel(t.id);
              setTunnels(next);
            }
          }
        ]);
      }}
    />
  );

  const alvo = alvoDoOrbe();

  const cabecalho = (
    <View style={styles.topo}>
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

      {/* Bottom Sheet Modal */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: m.insets.bottom + spacing.xl }]}>
          <View style={styles.puxador} />
          <Text style={styles.sheetTitle}>Adicionar túnel</Text>

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
        </View>
      </Modal>
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
    <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={onPress}>
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

  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  puxador: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  sheetTitle: { ...type.label, color: colors.textDim, marginBottom: spacing.md },
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
