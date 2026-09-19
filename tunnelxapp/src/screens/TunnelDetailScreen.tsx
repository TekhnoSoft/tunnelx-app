import React, { useLayoutEffect, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PencilSimple, Trash, ArrowDown, ArrowUp } from 'phosphor-react-native';
import { removeTunnel, upsertTunnel } from '../storage/tunnels';
import { isEditableTunnel } from '../models/Tunnel';
import * as WireGuard from '../native/WireGuard';
import Screen from '../components/Screen';
import Card from '../components/Card';
import { colors, radius, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'TunnelDetail'>;

/** Par rótulo/valor. `mono` para o que é conferido caractere a caractere. */
function Linha({
  label,
  value,
  mono,
  selectable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  selectable?: boolean;
}) {
  return (
    <View style={styles.linha}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.valor, mono && styles.valorMono]} selectable={selectable}>
        {value}
      </Text>
    </View>
  );
}

export default function TunnelDetailScreen({ navigation, route }: Props) {
  const m = useLayout();
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

  /*
   * Editar e excluir só valem para túnel importado pelo próprio usuário.
   *
   * Esta tela abria os dois para qualquer túnel — inclusive os do plano, que a
   * lista já protege. Era o caminho por fora: bastava abrir o detalhe para
   * apagar um túnel que o servidor continua cobrando e que a próxima
   * sincronização traria de volta.
   *
   * `tunnel.origin` existe só no que veio da conta; o importado à mão não tem.
   */
  const podeMexer = isEditableTunnel(tunnel);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.headerBtn}
            disabled={!podeMexer}
            accessibilityState={{ disabled: !podeMexer }}
            accessibilityLabel={podeMexer ? 'Editar túnel' : 'Túnel do plano: não pode ser editado'}
            onPress={() => navigation.navigate('TunnelForm', { tunnel })}
          >
            <PencilSimple size={18} color={podeMexer ? colors.textMuted : colors.textDim} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            disabled={!podeMexer}
            accessibilityState={{ disabled: !podeMexer }}
            accessibilityLabel={podeMexer ? 'Excluir túnel' : 'Túnel do plano: não pode ser excluído'}
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
            <Trash size={18} color={podeMexer ? colors.danger : colors.textDim} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, tunnel, podeMexer]);

  return (
    // ScrollView e nao View: o conteudo tem altura variavel (um card por peer) e
    // com 2+ peers o card de Estatisticas ficava fora da tela, sem rolagem.
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: m.gutter,
          paddingTop: m.paddingTop,
          paddingBottom: m.paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.nomeTunel} numberOfLines={2}>
          {tunnel.name}
        </Text>

        <Card label="Interface" style={styles.card}>
          <Linha label="Nome" value={tunnel.name} />
          {tunnel.interface.addresses ? (
            <Linha label="Endereços" value={tunnel.interface.addresses} mono selectable />
          ) : null}
          {tunnel.interface.dns ? (
            <Linha label="DNS" value={tunnel.interface.dns} mono selectable />
          ) : null}
        </Card>

        {tunnel.peers?.map((peer, idx) => (
          <Card key={idx} label={`Par #${idx + 1}`} accent={colors.primary} style={styles.card}>
            <Linha label="Chave pública" value={peer.publicKey} mono selectable />
            {peer.allowedIPs ? (
              <Linha label="IPs permitidos" value={peer.allowedIPs} mono selectable />
            ) : null}
            {peer.endpoint ? <Linha label="Endpoint" value={peer.endpoint} mono selectable /> : null}
          </Card>
        ))}

        {stats ? (
          <Card label="Transferência" accent={colors.green} style={styles.card}>
            <View style={styles.metricas}>
              <View style={styles.metrica}>
                <View style={styles.metricaTopo}>
                  <ArrowDown size={14} color={colors.greenInk} weight="bold" />
                  <Text style={styles.metricaLabel}>Recebido</Text>
                </View>
                <Text style={styles.metricaValor}>{stats.rxMiB.toFixed(2)}</Text>
                <Text style={styles.metricaUnidade}>MiB</Text>
              </View>

              <View style={styles.separador} />

              <View style={styles.metrica}>
                <View style={styles.metricaTopo}>
                  <ArrowUp size={14} color={colors.primary} weight="bold" />
                  <Text style={styles.metricaLabel}>Enviado</Text>
                </View>
                <Text style={styles.metricaValor}>{stats.txMiB.toFixed(2)}</Text>
                <Text style={styles.metricaUnidade}>MiB</Text>
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  nomeTunel: { ...type.display, fontSize: 26, color: colors.text, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  linha: { marginBottom: spacing.md },
  label: { ...type.label, color: colors.textDim, marginBottom: 4 },
  valor: { ...type.body, color: colors.text },
  valorMono: {
    ...type.mono,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  metricas: { flexDirection: 'row', alignItems: 'center' },
  metrica: { flex: 1, alignItems: 'center' },
  metricaTopo: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
  metricaLabel: { ...type.label, color: colors.textDim },
  metricaValor: { ...type.display, fontSize: 28, color: colors.text },
  metricaUnidade: { ...type.tiny, color: colors.textDim, marginTop: 2 },
  separador: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
});
