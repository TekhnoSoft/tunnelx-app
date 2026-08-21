import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { parseWireGuardConf, toWireGuardConf } from '../utils/wgConfig';
import { upsertTunnel } from '../storage/tunnels';
import * as WireGuard from '../native/WireGuard';

type Props = { navigation: any };

export default function QRScanScreen({ navigation }: Props) {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [handled, setHandled] = useState<boolean>(false);
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (handled) return;
      const value = codes?.[0]?.value;
      if (!value) return;
      setHandled(true);
      onCode(value);
    },
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const status : any = await Camera.requestCameraPermission();
      if (!mounted) return;
      setHasPermission(status === 'authorized' || status === 'granted');
    })();
    return () => { mounted = false; };
  }, []);

  // With CodeScanner, we handle codes in onCodeScanned

  const onCode = useCallback(async (text: string) => {
    try {
      const tunnel = parseWireGuardConf(text);
      const next = await upsertTunnel(tunnel);
      const conf = toWireGuardConf(tunnel);
      await WireGuard.applyConfig({ id: tunnel.id, name: tunnel.name, conf });
      setIsActive(false);
      Alert.alert('QR lido', `Túnel "${tunnel.name}" importado.`);
      navigation.reset({ index: 0, routes: [{ name: 'Home', params: { initialTunnels: next } }] });
    } catch (e: any) {
      setHandled(false);
      Alert.alert('Falha ao importar do QR', e?.message || 'Erro desconhecido');
    }
  }, [navigation]);

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Permissão de câmera necessária</Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={async () => {
            const status : any = await Camera.requestCameraPermission();
            setHasPermission(status === 'authorized' || status === 'granted');
          }}
        >
          <Text style={styles.permissionBtnText}>Permitir acesso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}><Text style={{ color: '#fff' }}>Carregando câmera…</Text></View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        codeScanner={codeScanner}
      />
      <View style={styles.overlay}><Text style={styles.hint}>Aponte para o QR com a configuração</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  hint: { color: '#fff', fontWeight: '600' },
  permissionContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  permissionText: { color: '#fff', marginBottom: 12 },
  permissionBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#2e7d32', borderRadius: 8 },
  permissionBtnText: { color: '#fff', fontWeight: '600' },
});
