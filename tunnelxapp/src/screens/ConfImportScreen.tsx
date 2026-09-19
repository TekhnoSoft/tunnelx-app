import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { NativeModules } from 'react-native';
import { FolderOpen, ClipboardText } from 'phosphor-react-native';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';
import Screen from '../components/Screen';
import Button from '../components/Button';
import { colors, radius, spacing, type } from '../theme';
import { useLayout, useKeyboardOverlap } from '../theme/useLayout';

type Props = { navigation: any };

export default function ConfImportScreen({ navigation }: Props) {
  const m = useLayout();
  const tecladoCobre = useKeyboardOverlap();
  const [text, setText] = useState('');
  const [focado, setFocado] = useState(false);

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

  const onImportColado = async () => {
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
  };

  return (
    // Tela sem scroll: o TextInput com flex:1 empurra os botoes para o rodape,
    // entao o inset vai no proprio container.
    <Screen>
      {/* Sem `behavior`: quem empurra o conteudo e o useKeyboardOverlap, que
          mede a sobreposicao real. Com 'padding' no iOS os dois somariam e o
          formulario subiria o dobro do necessario. */}
      <KeyboardAvoidingView style={styles.flex}>
        <View
          style={[
            styles.container,
            { paddingHorizontal: m.gutter, paddingTop: m.paddingTop, paddingBottom: m.paddingBottom + tecladoCobre },
          ]}
        >
          <Text style={styles.titulo}>Importar configuração</Text>
          <Text style={styles.subtitulo}>
            Escolha um arquivo .conf do aparelho ou cole o conteúdo abaixo.
          </Text>

          <View style={[styles.editorBox, focado && styles.editorFocado]}>
            <Text style={styles.editorLabel}>Conteúdo do .conf</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder={'[Interface]\nPrivateKey = …\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = …'}
              placeholderTextColor={colors.textDim}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocado(true)}
              onBlur={() => setFocado(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Button
            label="Escolher arquivo"
            onPress={onImport}
            icon={<FolderOpen size={18} color="#fff" weight="bold" />}
            style={styles.botao}
          />
          <Button
            label="Importar do conteúdo colado"
            variant="ghost"
            onPress={onImportColado}
            icon={<ClipboardText size={18} color={colors.text} weight="bold" />}
            style={styles.botao}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingTop: spacing.lg },
  titulo: { ...type.display, fontSize: 26, color: colors.text },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  editorBox: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  editorFocado: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  editorLabel: { ...type.label, color: colors.textDim, marginBottom: spacing.sm },
  input: {
    flex: 1,
    ...type.mono,
    color: colors.text,
    textAlignVertical: 'top',
    padding: 0,
    lineHeight: 20,
  },
  botao: { marginBottom: spacing.md },
});
