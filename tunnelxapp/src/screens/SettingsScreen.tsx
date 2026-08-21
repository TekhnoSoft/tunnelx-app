import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Image } from 'react-native';
import * as WireGuard from '../native/WireGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncConnections } from '../services/sync';
import type { SessionClient } from '../storage/session';

type Props = {
  client?: SessionClient | null;
  onSignOut?: (removerTuneis: boolean) => Promise<void> | void;
};

export default function SettingsScreen({ client, onSignOut }: Props) {
  const insets = useSafeAreaInsets();

  const onSync = async () => {
    try {
      const r = await syncConnections();
      const partes = [`${r.imported} conexão(ões) atualizada(s)`];
      if (r.pending) partes.push(`${r.pending} ainda em preparação`);
      if (r.failed.length) partes.push(`${r.failed.length} com erro`);
      Alert.alert('Sincronização concluída', partes.join(' | '));
    } catch (e: any) {
      Alert.alert('Falha ao sincronizar', e?.message || 'Erro desconhecido');
    }
  };

  const onLogout = () => {
    Alert.alert(
      'Sair da conta',
      'Os túneis já instalados continuam funcionando. Você pode removê-los junto se este aparelho não for mais seu.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', onPress: () => onSignOut && onSignOut(false) },
        {
          text: 'Sair e remover túneis',
          style: 'destructive',
          onPress: () => onSignOut && onSignOut(true),
        },
      ]
    );
  };
  const onExportZip = () => {
    Alert.alert('Em breve', 'Exportar túneis para arquivo zip será implementado.');
  };

  const onAddQuickTile = () => {
    Alert.alert('Em breve', 'Adicionar botão ao painel de configurações rápidas será implementado.');
  };

  const onShowLogs = () => {
    Alert.alert('Em breve', 'Exibir registros da aplicação será implementado.');
  };

  const onAdvanced = () => {
    Alert.alert('Em breve', 'Opções avançadas serão implementadas.');
  };

  const onRequestVpnPermission = async () => {
    try {
      const ok = await WireGuard.prepareVpn();
      if (ok) {
        Alert.alert(
          'Permissão de VPN',
          'Se a tela de permissão abriu, aceite para permitir o uso de VPN. Se não abriu, a permissão já está ativa.'
        );
      }
    } catch (e: any) {
      Alert.alert('Erro ao solicitar permissão', e?.message || 'Falha ao abrir a tela de permissão.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}>
      <View style={styles.headerBox}>
        <Image source={require('../../logo.png')} style={styles.logo} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.title}>{client?.name || 'TunnelX'}</Text>
          <Text style={styles.subtitle}>{client?.cpf ? `CPF ${client.cpf}` : 'Cliente TunnelX'}</Text>
        </View>
      </View>

      {client ? (
        <View style={styles.section}>
          <TouchableOpacity style={styles.item} onPress={onSync}>
            <Text style={styles.itemTitle}>Sincronizar minhas conexões</Text>
            <Text style={styles.itemDesc}>Busca no servidor as conexões da sua conta e atualiza os túneis</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.item, styles.semLinha]} onPress={onLogout}>
            <Text style={[styles.itemTitle, styles.sair]}>Sair da conta</Text>
            <Text style={styles.itemDesc}>Será necessário entrar de novo com CPF e senha</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <TouchableOpacity style={styles.item} onPress={onRequestVpnPermission}>
          <Text style={styles.itemTitle}>Permitir uso de VPN (Android)</Text>
          <Text style={styles.itemDesc}>Solicita a permissão necessária para ativar túneis</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={onExportZip}>
          <Text style={styles.itemTitle}>Exportar túneis para arquivo zip</Text>
          <Text style={styles.itemDesc}>O arquivo Zip será salvo na pasta de downloads</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={onAddQuickTile}>
          <Text style={styles.itemTitle}>Adicionar botão ao painel de configurações rápidas</Text>
          <Text style={styles.itemDesc}>A tecla de atalho alterna o túnel mais recente</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={onShowLogs}>
          <Text style={styles.itemTitle}>Exibir registros da aplicação</Text>
          <Text style={styles.itemDesc}>Registros podem ajudar na depuração</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.item} onPress={onAdvanced}>
          <Text style={styles.itemTitle}>Avançado</Text>
          <Text style={styles.itemDesc}>Opções para controle remoto e diagnósticos</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { color: '#666', marginTop: 2 },
  section: { marginTop: 16, backgroundColor: '#fff', borderRadius: 8 },
  item: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  itemTitle: { fontSize: 16, fontWeight: '500' },
  itemDesc: { fontSize: 12, color: '#666', marginTop: 4 },
  semLinha: { borderBottomWidth: 0 },
  sair: { color: '#B00020' },
});