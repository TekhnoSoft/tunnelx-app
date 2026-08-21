import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Text, Modal, Pressable, Alert, Platform, AppState, PermissionsAndroid, InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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
  const stopGuard = useRef(false);

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

  // Solicita permissão de notificação ao entrar na Home (Android 13+)
  useEffect(() => {
    // Assina eventos de status do túnel para refletir conexão/desconexão
    const sub = WireGuard.subscribeStatus((st) => setConnected(st === 'connected'));
    // Faz uma checagem inicial
    WireGuard.isConnected().then(setConnected).catch(() => setConnected(false));
    // Polling adicional para garantir precisão mesmo sem eventos
    let mounted = true;
    let timerId: any = setInterval(async () => {
      try {
        const ok = await WireGuard.isConnected();
        let trafficConnected = false;
        try {
          const latest = await loadTunnels();
          const allInactive = latest.length > 0 && latest.every(t => !t.active);
          trafficConnected = latest.some(t => {
            const rx = t.stats?.rxMiB ?? 0;
            const tx = t.stats?.txMiB ?? 0;
            return (rx + tx) > 0;
          });
          if (allInactive && !stopGuard.current) {
            stopGuard.current = true;
            try { await WireGuard.stop(latest[0]?.id ?? 'any'); } catch {}
          }
          if (!allInactive && stopGuard.current) stopGuard.current = false;
          if (allInactive) {
            if (mounted) setConnected(false);
            return;
          }
        } catch {}
        const final = ok || trafficConnected;
        if (mounted) setConnected(final);
      } catch {}
    }, 1500);
    return () => { sub.remove(); clearInterval(timerId); mounted = false; };
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
    const enable = !tun.active;
    // Otimista: ao habilitar, mantenha o switch ligado enquanto solicita permissões/ativa o serviço
    if (enable) {
      const optimistic = tunnels.map(t => (t.id === tun.id ? { ...t, active: true } : t));
      setTunnels(optimistic);
      try { await saveTunnels(optimistic); } catch {}
    }
    try {
      if (enable) {
        // Adia tarefas para após interações de UI, reduzindo risco de ANR
        InteractionManager.runAfterInteractions(async () => {
          try {
            // Em Android 13+, garanta permissão de notificação para o serviço em primeiro plano
            if (Platform.OS === 'android') {
              try {
                const { status } = await checkNotifications();
                if (status !== RESULTS.GRANTED && status !== RESULTS.LIMITED) {
                  await requestNotifications(['alert', 'sound', 'badge']);
                }
              } catch {
                // Ignora falhas de checagem; seguimos com tentativa de iniciar o serviço
              }
            }
            // Solicita a permissão de VPN antes de aplicar/ativar
            try { await WireGuard.prepareVpn(); } catch {}
            const conf = toWireGuardConf(tun);
            await WireGuard.applyConfig({ id: tun.id, name: tun.name, conf });
            await WireGuard.start(tun.id);
            Alert.alert('Conectado', `Túnel "${tun.name}" iniciado com sucesso.`);

            const updated = tunnels.map(t => (t.id === tun.id ? { ...t, active: true } : t));
            setTunnels(updated);
            try { await saveTunnels(updated); } catch {}
          } catch (e2: any) {
            // Em caso de erro, reverte estado
            const revertedInner = tunnels.map(t => (t.id === tun.id ? { ...t, active: false } : t));
            setTunnels(revertedInner);
            try { await saveTunnels(revertedInner); } catch {}
            // Propaga para o catch externo
            throw e2;
          }
        });
      } else {
        await WireGuard.stop(tun.id);
        const updated = tunnels.map(t => (t.id === tun.id ? { ...t, active: false } : t));
        setTunnels(updated);
        try { await saveTunnels(updated); } catch {}
        const allInactive = updated.every(t => !t.active);
        if (allInactive) {
          try { await WireGuard.stop(tun.id); } catch {}
          setConnected(false);
        }
      }
    } catch (e: any) {
      if (e?.code === 'E_NEEDS_PREPARE') {
        try {
          // Solicita a permissão; após o usuário fechar a tela e o app voltar ao estado 'active', tentamos iniciar.
          await WireGuard.prepareVpn();
          Alert.alert('Permissão de VPN', 'Conceda a permissão do Android para prosseguir. Voltando ao app, iniciaremos o túnel.');
          const startTimeout = setTimeout(() => {
            // Watchdog: se não voltar a 'active' em tempo hábil, avisa e reverte
            Alert.alert('Demora na permissão', 'O Android demorou para retornar. Tente novamente após conceder a permissão.');
          }, 12000);
          const sub = AppState.addEventListener('change', async (state) => {
            if (state === 'active') {
              try {
                sub.remove();
                clearTimeout(startTimeout);
                await WireGuard.start(tun.id);
                const reupdated = tunnels.map(t => (t.id === tun.id ? { ...t, active: true } : t));
                setTunnels(reupdated);
                try { await saveTunnels(reupdated); } catch {}
              } catch (err2: any) {
                if (err2?.code === 'E_NEEDS_PREPARE') {
                  Alert.alert('Permissão necessária', 'Conceda a permissão de VPN do Android e tente ativar novamente.');
                } else {
                  Alert.alert('Falha ao ativar', err2?.message || 'Ocorreu um erro ao ativar o túnel.');
                  const reverted = tunnels.map(t => (t.id === tun.id ? { ...t, active: false } : t));
                  setTunnels(reverted);
                  try { await saveTunnels(reverted); } catch {}
                }
              }
            }
          });
        } catch (prepErr: any) {
          Alert.alert('Erro ao solicitar permissão', prepErr?.message || 'Falha ao abrir a tela de permissão.');
          const reverted = tunnels.map(t => (t.id === tun.id ? { ...t, active: false } : t));
          setTunnels(reverted);
          try { await saveTunnels(reverted); } catch {}
        }
        return;
      }
      // Para outros erros, reverte o estado
      const reverted = tunnels.map(t => (t.id === tun.id ? { ...t, active: false } : t));
      setTunnels(reverted);
      try { await saveTunnels(reverted); } catch {}
      
      Alert.alert(
        'Falha na conexão',
        e?.message || 'Ocorreu um erro desconhecido ao tentar conectar.'
      );
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
      <FlatList
        data={tunnels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={() => (
          <View style={styles.empty}> 
            <Text style={styles.emptyText}>Nenhum túnel. Toque ＋ para criar.</Text>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowSheet(true)}>
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowSheet(false)} />
        <View style={styles.sheet}>
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
    bottom: 24,
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
