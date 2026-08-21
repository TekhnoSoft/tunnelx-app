import React, { useLayoutEffect, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PencilSimple, Trash } from 'phosphor-react-native';
import { removeTunnel, upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';

type Props = NativeStackScreenProps<RootStackParamList, 'TunnelDetail'>;

export default function TunnelDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { tunnel } = route.params;
  const [stats, setStats] = useState(tunnel.stats ?? { rxMiB: 0, txMiB: 0 });
  useEffect(() => {
    let mounted = true;
    let last = Date.now();
    const timer = setInterval(async () => {
      const ok = await WireGuard.isConnected();
      const now = Date.now();
      const dt = Math.max(0, now - last) / 1000;
      last = now;
      if (!mounted) return;
      if (ok) {
        setStats(s => {
          const next = { rxMiB: s.rxMiB + dt * 0.05, txMiB: s.txMiB + dt * 0.05 };
          const updated = { ...tunnel, stats: next };
          upsertTunnel(updated);
          return next;
        });
      } else {
        setStats(s => {
          const next = { rxMiB: s.rxMiB, txMiB: s.txMiB };
          const updated = { ...tunnel, stats: next };
          upsertTunnel(updated);
          return next;
        });
      }
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [tunnel]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 6 }} onPress={() => navigation.navigate('TunnelForm', { tunnel })}>
            <PencilSimple size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            onPress={() =>
              Alert.alert('Excluir túnel', `Deseja excluir "${tunnel.name}"?`, [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Excluir', style: 'destructive', onPress: async () => {
                    const next = await removeTunnel(tunnel.id);
                    navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
                  }
                }
              ])
            }
          >
            <Trash size={18} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, tunnel]);

  return (
    // ScrollView e nao View: o conteudo tem altura variavel (um card por peer) e
    // com 2+ peers o card de Estatisticas ficava fora da tela, sem rolagem.
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 12, paddingBottom: 12 + insets.bottom + 16 }}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Interface</Text>
        <Text style={styles.label}>Nome</Text>
        <Text>{tunnel.name}</Text>
        {tunnel.interface.publicKey ? (
          <></>
        ) : null}
        {tunnel.interface.addresses ? (
          <>
            <Text style={styles.label}>Endereços</Text>
            <Text>{tunnel.interface.addresses}</Text>
          </>
        ) : null}
        {tunnel.interface.dns ? (
          <>
            <Text style={styles.label}>DNS</Text>
            <Text>{tunnel.interface.dns}</Text>
          </>
        ) : null}
      </View>

      {tunnel.peers?.map((peer, idx) => (
        <View key={idx} style={styles.card}>
          <Text style={styles.title}>Par #{idx + 1}</Text>
          <Text style={styles.label}>Chave pública</Text>
          <Text selectable>{peer.publicKey}</Text>
          {peer.allowedIPs ? (
            <>
              <Text style={styles.label}>IPs Permitidos</Text>
              <Text>{peer.allowedIPs}</Text>
            </>
          ) : null}
          {peer.endpoint ? (
            <>
              <Text style={styles.label}>Endpoint</Text>
              <Text>{peer.endpoint}</Text>
            </>
          ) : null}
        </View>
      ))}

      {stats ? (
        <View style={styles.card}>
          <Text style={styles.title}>Estatísticas</Text>
          <Text style={styles.label}>Transferência</Text>
          <Text>rx: {stats.rxMiB.toFixed(2)} MiB, tx: {stats.txMiB.toFixed(2)} MiB</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, // o padding migrou para o contentContainerStyle
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 12, elevation: 2 },
  title: { fontWeight: '600', marginBottom: 8 },
  label: { marginTop: 6, color: '#666', fontSize: 12 },
});
