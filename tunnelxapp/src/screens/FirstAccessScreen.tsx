import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeSlash, ArrowLeft, Key } from 'phosphor-react-native';
import { login } from '../api/client';
import type { SessionClient } from '../storage/session';
import { maskCpf } from '../utils/cpf';

type Props = {
  /**
   * Entrou com a senha provisória: quem chama leva à tela de nova senha e
   * repassa `senhaProvisoria`, para não pedir de novo o que acabou de ser
   * digitado. A senha fica só em memória.
   */
  onNeedsNewPassword: (client: SessionClient, senhaProvisoria: string) => void;
  /**
   * A senha já não era provisória — o cliente tinha trocado antes e veio parar
   * aqui por engano. Não faz sentido mandá-lo de volta ao login: ele acabou de
   * se autenticar, então entra direto.
   */
  onSigned: (client: SessionClient) => void;
  onCancel: () => void;
};

export default function FirstAccessScreen({ onNeedsNewPassword, onSigned, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const digitos = cpf.replace(/\D/g, '');
  const podeContinuar = digitos.length === 11 && senha.length > 0 && !carregando;

  const continuar = async () => {
    if (!podeContinuar) return;
    setErro(null);
    setCarregando(true);
    try {
      const { client, mustChangePassword } = await login(digitos, senha);
      if (mustChangePassword) {
        onNeedsNewPassword(client, senha);
      } else {
        onSigned(client);
      }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível confirmar seus dados.');
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
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.voltar} onPress={onCancel} accessibilityLabel="Voltar">
          <ArrowLeft size={20} color="#007AFF" />
          <Text style={styles.voltarTexto}>Voltar</Text>
        </TouchableOpacity>

        <View style={styles.brand}>
          <Key size={44} color="#007AFF" weight="duotone" />
          <Text style={styles.title}>Primeiro acesso</Text>
          <Text style={styles.subtitle}>
            Confirme seu CPF e digite a senha provisória que você recebeu no cadastro. No passo
            seguinte você cria a sua senha.
          </Text>
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

          <Text style={styles.label}>Senha provisória</Text>
          <View style={styles.senhaBox}>
            <TextInput
              style={styles.senhaInput}
              value={senha}
              onChangeText={setSenha}
              placeholder="Ex.: ABCD-2345"
              secureTextEntry={!verSenha}
              // A senha gerada é toda em maiúsculas e sem acento; o teclado já
              // abre no formato certo para não virar erro de digitação.
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={continuar}
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
            style={[styles.botao, !podeContinuar && styles.botaoInativo]}
            onPress={continuar}
            disabled={!podeContinuar}
          >
            {carregando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botaoTexto}>Continuar</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.ajuda}>
            A senha provisória é entregue pela TunnelX no momento do cadastro. Se você não recebeu
            ou não lembra, fale com o suporte — uma nova pode ser gerada.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, flexGrow: 1, justifyContent: 'center' },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  voltarTexto: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
  brand: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#111', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center', lineHeight: 20 },
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
