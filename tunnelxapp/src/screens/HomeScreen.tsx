import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Modal, Pressable, Alert, Platform, AppState, PermissionsAndroid } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TunnelListItem from '../components/TunnelListItem';
import type { Tunnel } from '../models/Tunnel';
import { saveTunnels, removeTunnel, loadTunnels } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import { toWireGuardConf } from '../utils/wgConfig';
import { Plus, FileArrowDown, QrCode, PencilSimple } from 'phosphor-react-native';
// Importação via arquivo será feita pela tela dedicada (ConfImport)
import { RESULTS, checkNotifications, requestNotifications } from 'react-native-permissions';

type Props = {
  navigation: any;
  initialTunnels?: Tunnel[];
};

export default function HomeScreen({ navigation, initialTunnels = [] }: Props) {
  const [tunnels, setTunnels] = useState<Tunnel[]>(initialTunnels);
  const [showSheet, setShowSheet] = useState(false);
  const [connected, setConnected] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  // activeId: qual tunel o NATIVO diz estar ativo. busy: transicao em andamento.
  const [activeId, setActiveId] = useState<string | null>(null);
  const busy = useRef(false);

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
    const requestNotifications = async () => {
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
    requestNotifications();
  }, []);

  const onToggle = async (tun: Tunnel) => {
    // Guarda de reentrancia: o switch nao pode disparar duas transicoes concorrentes
    // sobre o mesmo TUN.
    if (busy.current) return;
    busy.current = true;
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
    }
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
      busy={busy.current}
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

  return (
    <View style={styles.container}>
      {/* Cabeçalho simples de status */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot, { backgroundColor: connected ? '#2ecc71' : '#e74c3c' }]} />
        <Text style={styles.statusText}>{connected ? 'Conectado' : 'Desconectado'}</Text>
      </View>
      {/* paddingBottom: espaco para o ultimo item nao ficar sob o FAB nem sob a barra de navegacao */}
      <FlatList
        data={tunnels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        ListEmptyComponent={() => (
          <View style={styles.empty}> 
            <Text style={styles.emptyText}>Nenhum túnel. Toque ＋ para criar.</Text>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 24 }]} onPress={() => setShowSheet(true)}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.sheetTitle}>Adicionar túnel</Text>
          <Pressable style={styles.option} onPress={onCreateFromFile}>
            <FileArrowDown size={22} style={styles.optionIcon} />
            <Text style={styles.optionText}>Criar a partir de um arquivo</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onReadQR}>
            <QrCode size={22} style={styles.optionIcon} />
            <Text style={styles.optionText}>Ler código QR</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onCreateFromScratch}>
            <PencilSimple size={22} style={styles.optionIcon} />
            <Text style={styles.optionText}>Criar do zero</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: '#333' },
  empty: { alignItems: 'center', marginTop: 48 },
  emptyText: { color: '#888' },
  fab: {
    position: 'absolute',
    right: 24,
    // bottom vem do inline no JSX: insets.bottom + 24
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    elevation: 8,
  },
  sheetTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  optionIcon: { marginRight: 12 },
  optionText: { fontSize: 15 },
});
