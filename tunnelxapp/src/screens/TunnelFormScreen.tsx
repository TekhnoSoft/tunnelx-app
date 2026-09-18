import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { Tunnel, Peer } from '../models/Tunnel';
import { upsertTunnel } from '../storage/tunnels';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus, Trash, FloppyDisk } from 'phosphor-react-native';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import { colors, radius, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';

type Props = NativeStackScreenProps<RootStackParamList, 'TunnelForm'>;

export default function TunnelFormScreen({ navigation, route }: Props) {
  const m = useLayout();
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
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: m.gutter,
            paddingTop: m.paddingTop,
            paddingBottom: m.paddingBottom,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.titulo}>{editing ? 'Editar túnel' : 'Novo túnel'}</Text>

          <Card label="Interface" style={styles.card}>
            <Field label="Nome" placeholder="Meu túnel" value={name} onChangeText={setName} />
            <Field
              label="Chave privada"
              placeholder="Chave privada da interface"
              value={privKey}
              onChangeText={setPrivKey}
              secret
              mono
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.row}>
              <Field
                label="Endereços"
                placeholder="10.0.0.2/32"
                value={addresses}
                onChangeText={setAddresses}
                mono
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={styles.half}
              />
              <Field
                label="Porta de escuta"
                placeholder="aleatória"
                editable={false}
                containerStyle={styles.half}
              />
            </View>
            <View style={styles.row}>
              <Field
                label="Servidores DNS"
                placeholder="1.1.1.1"
                value={dns}
                onChangeText={setDns}
                mono
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={styles.half}
              />
              <Field
                label="MTU"
                placeholder="automático"
                editable={false}
                containerStyle={styles.half}
              />
            </View>
          </Card>

          <Card label="Pares" accent={colors.primary} style={styles.card}>
            {peers.map((peer, index) => (
              <View key={index} style={styles.peerBox}>
                <View style={styles.peerHeader}>
                  <Text style={styles.peerTitle}>Par #{index + 1}</Text>
                  {peers.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removePeer(index)}
                      style={styles.remover}
                      hitSlop={6}
                    >
                      <Trash size={14} color={colors.danger} />
                      <Text style={styles.removerTexto}>Remover</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Field
                  label="Chave pública"
                  placeholder="Chave pública do par"
                  value={peer.publicKey}
                  onChangeText={(t) => updatePeer(index, { publicKey: t })}
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Field
                  label="Chave pré-compartilhada"
                  placeholder="opcional"
                  value={peer.preSharedKey ?? ''}
                  onChangeText={(t) => updatePeer(index, { preSharedKey: t || undefined })}
                  secret
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.row}>
                  <Field
                    label="Keepalive"
                    placeholder="opcional"
                    value={peer.keepAlive?.toString() ?? ''}
                    onChangeText={(t) => updatePeer(index, { keepAlive: t ? Number(t) : undefined })}
                    keyboardType="numeric"
                    containerStyle={styles.half}
                  />
                  <Field
                    label="Unidade"
                    placeholder="segundos"
                    editable={false}
                    containerStyle={styles.half}
                  />
                </View>
                <Field
                  label="Endpoint"
                  placeholder="host:porta"
                  value={peer.endpoint ?? ''}
                  onChangeText={(t) => updatePeer(index, { endpoint: t })}
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Field
                  label="IPs permitidos"
                  placeholder="0.0.0.0/0"
                  value={peer.allowedIPs ?? ''}
                  onChangeText={(t) => updatePeer(index, { allowedIPs: t })}
                  mono
                  autoCapitalize="none"
                  autoCorrect={false}
                  containerStyle={styles.semMargem}
                />
              </View>
            ))}

            <Button
              label="Adicionar par"
              variant="ghost"
              onPress={addPeer}
              icon={<Plus size={17} color={colors.text} weight="bold" />}
            />
          </Card>

          <Button
            label="Salvar túnel"
            onPress={onSave}
            icon={<FloppyDisk size={18} color="#fff" weight="bold" />}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titulo: { ...type.display, fontSize: 26, color: colors.text, marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  semMargem: { marginBottom: 0 },
  peerBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  peerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  peerTitle: { ...type.heading, fontSize: 15, color: colors.text },
  remover: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removerTexto: { ...type.tiny, color: colors.danger, fontWeight: '700' },
});
