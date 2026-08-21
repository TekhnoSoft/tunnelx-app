import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Image } from 'react-native';
import * as WireGuard from '../native/WireGuard';

export default function SettingsScreen() {
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerBox}>
        <Image source={require('../../logo.png')} style={styles.logo} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.title}>TunnelX</Text>
          <Text style={styles.subtitle}>Cliente TunnelX (demo)</Text>
        </View>
      </View>

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
});