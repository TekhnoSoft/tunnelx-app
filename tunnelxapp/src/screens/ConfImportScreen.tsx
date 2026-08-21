import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { NativeModules } from 'react-native';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { navigation: any };

export default function ConfImportScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const onImport = async () => {
    try {
      // Abre explorador de arquivos via módulo nativo
      const FilePicker = (NativeModules as any)?.FilePicker;
      if (!FilePicker) {
        // Em bridgeless, Object.keys(NativeModules) pode retornar [] por ser lazy.
        console.warn('[ConfImport] NativeModules keys (podem estar vazias):', Object.keys(NativeModules));
        console.warn('[ConfImport] WireGuardModule existe?', !!(NativeModules as any)?.WireGuardModule);
        console.warn('[ConfImport] FilePicker existe?', !!(NativeModules as any)?.FilePicker);
        Alert.alert(
          'Módulo não disponível',
          'Reinstale o app após o build nativo (run-android/installDebug) para carregar o módulo de arquivo.'
        );
        return;
      }
      const result = await FilePicker.pickConf();

      const content = result?.content ?? '';
      if (!content.trim()) {
        throw new Error(`Arquivo vazio ou ilegível (${result?.uri || 'sem uri'})`);
      }

      // Handle wg:// scheme just like QR code
      const tunnel = parseWireGuardConf(content);
      
      let next;
      try {
        next = await upsertTunnel(tunnel);
      } catch (storeErr: any) {
        Alert.alert('Falha ao salvar túnel', storeErr?.message || 'Erro desconhecido');
        return;
      }

      const conf = toWireGuardConf(tunnel);
      try {
        await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf });
      } catch (wgErr: any) {
        Alert.alert('Falha ao aplicar configuração', wgErr?.message || 'Erro desconhecido');
        return;
      }

      Alert.alert('Importado', `Túnel "${tunnel.name}" pronto para iniciar.`);
      navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
    } catch (e: any) {
      console.error('[ConfImport] erro', e);
      Alert.alert('Falha ao importar', e?.message || 'Erro desconhecido');
    }
  };

  return (
    // Tela sem scroll: o TextInput com flex:1 empurra os botoes para o rodape,
    // entao o inset vai no proprio container.
    <View style={[styles.container, { paddingBottom: 16 + insets.bottom }]}>
      <Text style={styles.title}>Selecione um arquivo .conf ou cole o conteúdo</Text>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={12}
        placeholder="Cole o conteúdo do .conf ou um link wg://..."
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.btn} onPress={onImport}>
        <Text style={styles.btnText}>Importar do arquivo</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: '#555', marginTop: 10 }]}
        onPress={async () => {
          try {
            if (!text.trim()) {
              Alert.alert('Conteúdo vazio', 'Cole o conteúdo do arquivo .conf');
              return;
            }
            const confText = text.trim().startsWith('wg://') 
              ? decodeURIComponent(text.trim().slice(5)) 
              : text;
            const tunnel = parseWireGuardConf(confText);
            const next = await upsertTunnel(tunnel);
            const conf = toWireGuardConf(tunnel);
            await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf });
            Alert.alert('Importado', `Túnel "${tunnel.name}" pronto para iniciar.`);
            navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
          } catch (e: any) {
            Alert.alert('Falha ao importar', e?.message || 'Erro desconhecido');
          }
        }}
      >
        <Text style={styles.btnText}>Importar do conteúdo colado</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, textAlignVertical: 'top' },
  btn: { marginTop: 16, backgroundColor: '#007AFF', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
});