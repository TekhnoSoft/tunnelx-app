import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Alert } from 'react-native';
import type { Tunnel, Peer } from '../models/Tunnel';
import { upsertTunnel } from '../storage/tunnels';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TunnelForm'>;

export default function TunnelFormScreen({ navigation, route }: Props) {
  const editing: Tunnel | undefined = route?.params?.tunnel;
  const [name, setName] = useState(editing?.name ?? '');
  const [privKey, setPrivKey] = useState(editing?.interface.privateKey ?? '');
  const [addresses, setAddresses] = useState(editing?.interface.addresses ?? '');
  const [dns, setDns] = useState(editing?.interface.dns ?? '');
  const blankPeer = (): Peer => ({ publicKey: '', preSharedKey: undefined, keepAlive: undefined, endpoint: '', allowedIPs: '' });
  const [peers, setPeers] = useState<Peer[]>(editing?.peers?.length ? editing.peers : [blankPeer()]);

  const updatePeer = (index: number, patch: Partial<Peer>) => {
    setPeers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addPeer = () => setPeers((prev) => [...prev, blankPeer()]);
  const removePeer = (index: number) => {
    setPeers((prev) => prev.filter((_, i) => i !== index));
  };

  const onSave = async () => {
    if (!name || peers.some((p) => !p.publicKey)) {
      Alert.alert('Campos obrigatórios', 'Preencha Nome e a Chave pública de cada Par.');
      return;
    }
    const model: Tunnel = {
      id: editing?.id ?? `${Date.now()}`,
      name,
      interface: { privateKey: privKey, addresses, dns },
      peers,
      active: false,
      stats: { rxMiB: 0, txMiB: 0 },
    };
    await upsertTunnel(model);
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 12 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Interface</Text>
        <TextInput style={styles.input} placeholder="Nome" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Chave privada" value={privKey} onChangeText={setPrivKey} autoCapitalize="none" autoCorrect={false} />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder="Endereços" value={addresses} onChangeText={setAddresses} autoCapitalize="none" autoCorrect={false} />
          <TextInput style={[styles.input, styles.half]} placeholder="Porta de escuta (aleatória)" editable={false} />
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder="Servidores DNS" value={dns} onChangeText={setDns} autoCapitalize="none" autoCorrect={false} />
          <TextInput style={[styles.input, styles.half]} placeholder="MTU (automático)" editable={false} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Pares</Text>
        {peers.map((peer, index) => (
          <View key={index} style={styles.peerBox}>
            <View style={styles.peerHeader}>
              <Text style={styles.peerTitle}>Par #{index + 1}</Text>
              {peers.length > 1 && (
                <TouchableOpacity onPress={() => removePeer(index)}>
                  <Text style={styles.remove}>Remover</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Chave pública"
              value={peer.publicKey}
              onChangeText={(t) => updatePeer(index, { publicKey: t })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Chave pré-compartilhada (opcional)"
              value={peer.preSharedKey ?? ''}
              onChangeText={(t) => updatePeer(index, { preSharedKey: t || undefined })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.half]}
                placeholder="Keepalive persistente (opcional)"
                value={peer.keepAlive?.toString() ?? ''}
                onChangeText={(t) => updatePeer(index, { keepAlive: t ? Number(t) : undefined })}
                keyboardType="numeric"
              />
              <TextInput style={[styles.input, styles.half]} placeholder="segundos" editable={false} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Endpoint"
              value={peer.endpoint ?? ''}
              onChangeText={(t) => updatePeer(index, { endpoint: t })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="IPs Permitidos"
              value={peer.allowedIPs ?? ''}
              onChangeText={(t) => updatePeer(index, { allowedIPs: t })}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.addPeer} onPress={addPeer}>
          <Text style={styles.addPeerText}>Adicionar Par</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.save} onPress={onSave}>
        <Text style={styles.saveText}>Salvar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 12, elevation: 2 },
  title: { fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  save: { backgroundColor: '#007AFF', padding: 14, borderRadius: 8, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600' },
  peerBox: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 10, marginBottom: 10 },
  peerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  peerTitle: { fontWeight: '600' },
  remove: { color: '#FF3B30', fontWeight: '600' },
  addPeer: { backgroundColor: '#34C759', padding: 12, borderRadius: 8, alignItems: 'center' },
  addPeerText: { color: '#fff', fontWeight: '600' },
});
