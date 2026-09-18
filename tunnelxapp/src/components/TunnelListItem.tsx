import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Pressable } from 'react-native';
import type { Tunnel } from '../models/Tunnel';
import { PencilSimple, Trash, CaretRight } from 'phosphor-react-native';
import { brand, colors, radius, shadow, spacing, type } from '../theme';

type Props = {
  tunnel: Tunnel;
  /** Verdade vinda do backend nativo, nao o campo persistido tunnel.active. */
  isActive?: boolean;
  /** Bloqueia duplo-toque enquanto a transicao UP/DOWN esta em andamento. */
  busy?: boolean;
  onToggle: (tunnel: Tunnel) => void;
  onPress: (tunnel: Tunnel) => void;
  onEdit: (tunnel: Tunnel) => void;
  onDelete: (tunnel: Tunnel) => void;
};

export default function TunnelListItem({
  tunnel,
  isActive,
  busy,
  onToggle,
  onPress,
  onEdit,
  onDelete,
}: Props) {
  const firstPeer = tunnel.peers?.[0];
  const ativo = isActive ?? !!tunnel.active;

  return (
    <Pressable
      onPress={() => onPress(tunnel)}
      style={({ pressed }) => [styles.row, ativo && styles.rowAtiva, pressed && styles.pressed]}
    >
      {/* Barra lateral acesa: o túnel ativo se destaca na lista sem depender de
          ler o estado da chave, que fica na outra ponta da linha. */}
      <View style={[styles.faixa, ativo && styles.faixaAtiva]} />

      <View style={styles.info}>
        <View style={styles.linhaNome}>
          <Text style={styles.name} numberOfLines={1}>
            {tunnel.name}
          </Text>
          {ativo ? (
            <View style={styles.selo}>
              <View style={styles.pontoVivo} />
              <Text style={styles.seloTexto}>ATIVO</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.detail} numberOfLines={1}>
          {tunnel.interface.addresses || 'Sem endereço'}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {firstPeer
            ? `${firstPeer.endpoint || 'Sem endpoint'}${
                firstPeer.allowedIPs ? ` · ${firstPeer.allowedIPs}` : ''
              }`
            : 'Sem pares configurados'}
        </Text>
      </View>

      <View style={styles.actions}>
        <Switch
          value={ativo}
          disabled={!!busy}
          onValueChange={() => onToggle(tunnel)}
          trackColor={{ false: colors.border, true: colors.green }}
          thumbColor={ativo ? colors.greenInk : '#F4F4F5'}
        />
        <View style={styles.icones}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(tunnel)} hitSlop={6}>
            <PencilSimple size={17} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(tunnel)} hitSlop={6}>
            <Trash size={17} color={colors.danger} />
          </TouchableOpacity>
          <CaretRight size={14} color={colors.textDim} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingRight: spacing.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.card,
  },
  rowAtiva: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  pressed: { opacity: 0.7 },
  faixa: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: spacing.lg,
    backgroundColor: 'transparent',
  },
  faixaAtiva: { backgroundColor: brand.green },
  info: { flex: 1, paddingRight: spacing.md },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.heading, color: colors.text, flexShrink: 1 },
  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.green,
  },
  pontoVivo: { width: 5, height: 5, borderRadius: 3, backgroundColor: brand.green },
  seloTexto: { fontSize: 9, fontWeight: '800', color: colors.greenInk, letterSpacing: 0.8 },
  detail: { ...type.tiny, color: colors.textMuted, marginTop: 3, fontWeight: '500' },
  actions: { alignItems: 'flex-end', gap: spacing.sm },
  icones: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: { padding: spacing.xs },
});
