import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeSlash } from 'phosphor-react-native';
import { login } from '../api/client';
import { syncConnections } from '../services/sync';
import type { SessionClient } from '../storage/session';

type Props = {
  onSigned: (client: SessionClient) => void;
};

/** Máscara de CPF aplicada da esquerda para a direita, enquanto se digita. */
function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function LoginScreen({ onSigned }: Props) {
  const insets = useSafeAreaInsets();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const digitos = cpf.replace(/\D/g, '');
  const podeEntrar = digitos.length === 11 && senha.length > 0 && !carregando;

  const entrar = async () => {
    if (!podeEntrar) return;
    setErro(null);
    setCarregando(true);
    try {
      const client = await login(digitos, senha);

      // A importação dos túneis não pode derrubar o login: se a rede cair no
      // meio, o usuário entra assim mesmo e sincroniza depois pela Home.
      try {
        await syncConnections();
      } catch (e) {
        console.warn('[Login] falha ao sincronizar conexões', e);
      }

      onSigned(client);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível entrar.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image source={require('../../logo.png')} style={styles.logo} />
          <Text style={styles.title}>TunnelX</Text>
          <Text style={styles.subtitle}>Entre com seu CPF para acessar suas conexões</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>CPF</Text>
          <TextInput
            style={styles.input}
            value={cpf}
            onChangeText={t => setCpf(maskCpf(t))}
            placeholder="000.000.000-00"
            keyboardType="number-pad"
            returnKeyType="next"
            maxLength={14}
            autoComplete="off"
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.senhaBox}>
            <TextInput
              style={styles.senhaInput}
              value={senha}
              onChangeText={setSenha}
              placeholder="Senha recebida no cadastro"
              secureTextEntry={!verSenha}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={entrar}
            />
            <TouchableOpacity
              style={styles.olho}
              onPress={() => setVerSenha(v => !v)}
              accessibilityLabel={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {verSenha ? <EyeSlash size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <TouchableOpacity
            style={[styles.botao, !podeEntrar && styles.botaoInativo]}
            onPress={entrar}
            disabled={!podeEntrar}
          >
            {carregando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botaoTexto}>Entrar</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.ajuda}>
            A senha é entregue no momento do cadastro. Se você não tem uma, fale com o suporte
            TunnelX.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 72, height: 72, resizeMode: 'contain', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6, textAlign: 'center' },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  senhaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  senhaInput: { flex: 1, padding: 12, fontSize: 16 },
  olho: { paddingHorizontal: 12, paddingVertical: 10 },
  erro: {
    color: '#B00020',
    backgroundColor: '#FDECEA',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    fontSize: 13,
  },
  botao: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  botaoInativo: { backgroundColor: '#A9C9F0' },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ajuda: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
