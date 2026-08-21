import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import type { Tunnel } from '../models/Tunnel';
import { PencilSimple, Trash } from 'phosphor-react-native';

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

export default function TunnelListItem({ tunnel, isActive, busy, onToggle, onPress, onEdit, onDelete }: Props) {
  const firstPeer = tunnel.peers?.[0];
  return (
    <TouchableOpacity onPress={() => onPress(tunnel)} style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name}>{tunnel.name}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {tunnel.interface.addresses ? `${tunnel.interface.addresses}` : 'Sem endereço'}
        </Text>
        {firstPeer ? (
          <Text style={styles.detail} numberOfLines={1}>
            {firstPeer.endpoint ? `${firstPeer.endpoint}` : 'Sem endpoint'}
            {firstPeer.allowedIPs ? ` • ${firstPeer.allowedIPs}` : ''}
          </Text>
        ) : (
          <Text style={styles.detail}>Sem pares configurados</Text>
        )}
      </View>
      <View style={styles.actions}>
        <Switch
          value={isActive ?? !!tunnel.active}
          disabled={!!busy}
          onValueChange={() => onToggle(tunnel)}
        />
        <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(tunnel)}>
          <PencilSimple size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(tunnel)}>
          <Trash size={18} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  info: { flex: 1, paddingRight: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 12, color: '#666', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 6 },
});