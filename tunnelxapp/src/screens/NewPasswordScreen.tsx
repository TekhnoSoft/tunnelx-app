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
import { Eye, EyeSlash, ShieldCheck } from 'phosphor-react-native';
import { changePassword, ApiError } from '../api/client';

/** O servidor recusa abaixo disso; validar aqui evita a ida à rede para nada. */
const MINIMO = 6;

type Props = {
  /**
   * Senha provisória já digitada na etapa anterior do primeiro acesso.
   *
   * Vem em memória, nunca do disco: é a credencial que circulou por WhatsApp e
   * não tem por que sobreviver ao fim desta tela. Quando o app é reaberto no
   * meio do primeiro acesso ela se perde — por isso o campo abaixo reaparece em
   * vez de o usuário ficar preso.
   */
  senhaAtual?: string;
  onDone: () => void;
  /**
   * O token provisório venceu (dura 30 min) e a sessão já foi descartada pelo
   * cliente HTTP. Sem este caminho a tela continuaria aceitando toques e
   * falhando: o jeito de sair é refazer o login.
   */
  onSessionLost: () => void;
};

export default function NewPasswordScreen({ senhaAtual, onDone, onSessionLost }: Props) {
  const insets = useSafeAreaInsets();
  const precisaPedirAtual = !senhaAtual;

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const senhaEmUso = senhaAtual ?? atual;
  const curta = nova.length > 0 && nova.length < MINIMO;
  const divergem = confirma.length > 0 && nova !== confirma;
  const repetida = nova.length > 0 && nova === senhaEmUso;

  const podeSalvar =
    senhaEmUso.length > 0 &&
    nova.length >= MINIMO &&
    nova === confirma &&
    !repetida &&
    !carregando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setErro(null);
    setCarregando(true);
    try {
      await changePassword(senhaEmUso, nova);
      onDone();
    } catch (e: any) {
      // Senha atual errada volta como 400 (é dado, não autenticação). Um 401
      // aqui significa sessão perdida — e o cliente HTTP já apagou o token.
      if (e instanceof ApiError && e.status === 401) {
        onSessionLost();
        return;
      }
      setErro(e?.message || 'Não foi possível salvar a nova senha.');
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
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <ShieldCheck size={44} color="#007AFF" weight="duotone" />
          <Text style={styles.title}>Crie sua senha</Text>
          <Text style={styles.subtitle}>
            A senha que você recebeu é provisória. Escolha uma senha que só você saiba para
            concluir o primeiro acesso.
          </Text>
        </View>

        <View style={styles.form}>
          {precisaPedirAtual ? (
            <>
              <Text style={styles.label}>Senha provisória</Text>
              <TextInput
                style={styles.input}
                value={atual}
                onChangeText={setAtual}
                placeholder="A senha recebida no cadastro"
                secureTextEntry={!verSenha}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </>
          ) : null}

          <Text style={styles.label}>Nova senha</Text>
          <View style={styles.senhaBox}>
            <TextInput
              style={styles.senhaInput}
              value={nova}
              onChangeText={setNova}
              placeholder={`Ao menos ${MINIMO} caracteres`}
              secureTextEntry={!verSenha}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.olho}
              onPress={() => setVerSenha(v => !v)}
              accessibilityLabel={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {verSenha ? <EyeSlash size={20} color="#666" /> : <Eye size={20} color="#666" />}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Repita a nova senha</Text>
          <TextInput
            style={styles.input}
            value={confirma}
            onChangeText={setConfirma}
            placeholder="Digite de novo"
            secureTextEntry={!verSenha}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={salvar}
          />

          {/* Aviso enquanto digita: errar a confirmação é o tropeço mais comum
              aqui, e descobrir isso só no toque do botão irrita. */}
          {curta ? (
            <Text style={styles.dica}>A senha precisa ter ao menos {MINIMO} caracteres.</Text>
          ) : null}
          {repetida ? (
            <Text style={styles.dica}>Escolha uma senha diferente da provisória.</Text>
          ) : null}
          {divergem ? <Text style={styles.dica}>As duas senhas não estão iguais.</Text> : null}

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <TouchableOpacity
            style={[styles.botao, !podeSalvar && styles.botaoInativo]}
            onPress={salvar}
            disabled={!podeSalvar}
          >
            {carregando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.botaoTexto}>Salvar e entrar</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.ajuda}>
            Depois disso a senha provisória deixa de valer. Você passa a entrar com o seu CPF e a
            senha que acabou de criar.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingHorizontal: 24, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 24 },
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
  dica: { fontSize: 12, color: '#B45309', marginTop: 8 },
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
