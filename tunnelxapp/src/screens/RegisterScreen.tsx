import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, UserPlus, ShieldCheck } from 'phosphor-react-native';
import { register, checkCpf, type RegisterInput } from '../api/client';
import type { SessionClient } from '../storage/session';
import { maskCpf } from '../utils/cpf';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Field from '../components/Field';
import StepDots from '../components/StepDots';
import { colors, metrics, radius, spacing, type } from '../theme';
import { useKeyboardOverlap } from '../theme/useLayout';

type Props = {
  onCadastrado: (client: SessionClient) => void;
  onCancel: () => void;
};

const SENHA_MINIMA = 6;

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function mascaraCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Cadastro do cliente pelo próprio app.
 *
 * Em dois passos porque o formulário inteiro numa tela só, num celular com o
 * teclado aberto, vira uma parede. O primeiro passo é quem você é; o segundo é
 * a senha — e só aí o botão que cria a conta.
 */
export default function RegisterScreen({ onCadastrado, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = metrics(width);
  const tecladoCobre = useKeyboardOverlap();

  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState<{ uf?: string; cidade?: string; bairro?: string; logradouro?: string }>({});

  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');

  const [cpfOcupado, setCpfOcupado] = useState(false);
  const digitosCpf = cpf.replace(/\D/g, '');

  /**
   * Avisa que o CPF já tem conta enquanto se digita.
   *
   * Sem isso a pessoa preenche os dois passos inteiros para ser recusada no
   * envio — e o caminho certo (entrar com a senha) só apareceria no fim.
   */
  useEffect(() => {
    if (digitosCpf.length !== 11) {
      setCpfOcupado(false);
      return;
    }
    let vivo = true;
    checkCpf(digitosCpf)
      .then(r => {
        if (vivo) setCpfOcupado(r.valid && r.taken);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [digitosCpf]);

  /** ViaCEP preenche o endereço — é dado que o Asaas pede para cobrar no cartão. */
  useEffect(() => {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    let vivo = true;
    fetch(`https://viacep.com.br/ws/${d}/json/`)
      .then(r => r.json())
      .then(j => {
        if (!vivo || j.erro) return;
        setEndereco({ uf: j.uf, cidade: j.localidade, bairro: j.bairro, logradouro: j.logradouro });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [cep]);

  const dadosOk =
    nome.trim().length >= 3 &&
    digitosCpf.length === 11 &&
    !cpfOcupado &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) &&
    whatsapp.replace(/\D/g, '').length >= 10;

  const senhaOk =
    senha.length >= SENHA_MINIMA && senha === confirma;

  const criar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      const dados: RegisterInput = {
        name: nome.trim(),
        cpf: digitosCpf,
        email: email.trim(),
        whatsapp: whatsapp.replace(/\D/g, ''),
        password: senha,
        cep: cep.replace(/\D/g, '') || undefined,
        ...endereco,
      };
      const client = await register(dados);
      onCadastrado(client);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível criar sua conta.');
      // CPF tomado só aparece aqui se a checagem em tempo real não rodou
      // (sem rede, por exemplo). Volta ao passo 1, onde está o campo.
      if (/cpf/i.test(e?.message || '')) setPasso(0);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: m.gutter,
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.xl + tecladoCobre,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => (passo === 0 ? onCancel() : setPasso(0))}
            style={styles.voltar}
            hitSlop={8}
          >
            <ArrowLeft size={18} color={colors.textMuted} />
            <Text style={styles.voltarTexto}>{passo === 0 ? 'Voltar' : 'Meus dados'}</Text>
          </Pressable>

          <View style={styles.topo}>
            <View style={styles.icone}>
              {passo === 0 ? (
                <UserPlus size={30} color={colors.primary} weight="duotone" />
              ) : (
                <ShieldCheck size={30} color={colors.greenInk} weight="duotone" />
              )}
            </View>
            <Text style={styles.titulo}>{passo === 0 ? 'Criar sua conta' : 'Crie sua senha'}</Text>
            <Text style={styles.subtitulo}>
              {passo === 0
                ? 'Depois você escolhe o plano e ativa sua conexão.'
                : 'Escolha uma senha que só você saiba. É com ela e o seu CPF que você entra.'}
            </Text>
            <StepDots total={2} atual={passo} style={styles.passos} />
          </View>

          {passo === 0 ? (
            <Card label="Seus dados">
              <Field
                label="Nome completo"
                value={nome}
                onChangeText={setNome}
                placeholder="Como no documento"
                autoCapitalize="words"
              />
              <Field
                label="CPF"
                value={cpf}
                onChangeText={t => setCpf(maskCpf(t))}
                placeholder="000.000.000-00"
                keyboardType="number-pad"
                maxLength={14}
                mono
                hint={cpfOcupado ? 'Este CPF já tem conta. Volte e entre com sua senha.' : undefined}
                hintTone="error"
              />
              <Field
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="WhatsApp"
                value={whatsapp}
                onChangeText={t => setWhatsapp(mascaraTelefone(t))}
                placeholder="(00) 00000-0000"
                keyboardType="number-pad"
                maxLength={15}
              />
              <Field
                label="CEP"
                value={cep}
                onChangeText={t => setCep(mascaraCep(t))}
                placeholder="00000-000"
                keyboardType="number-pad"
                maxLength={9}
                mono
                hint={
                  endereco.cidade
                    ? `${endereco.logradouro ? endereco.logradouro + ', ' : ''}${endereco.bairro ?? ''} — ${endereco.cidade}/${endereco.uf}`
                    : 'Usado na cobrança do cartão'
                }
                hintTone="warn"
                containerStyle={styles.ultimoCampo}
              />

              <Button
                label="Continuar"
                onPress={() => setPasso(1)}
                disabled={!dadosOk}
                icon={<ArrowRight size={18} color="#fff" weight="bold" />}
                style={styles.botao}
              />
            </Card>
          ) : (
            <Card label="Sua senha" accent={colors.green}>
              <Field
                label="Senha"
                value={senha}
                onChangeText={setSenha}
                placeholder={`Ao menos ${SENHA_MINIMA} caracteres`}
                secret
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="Repita a senha"
                value={confirma}
                onChangeText={setConfirma}
                placeholder="Digite de novo"
                secret
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={criar}
                hint={
                  confirma.length > 0 && senha !== confirma ? 'As duas senhas não estão iguais.' : undefined
                }
                hintTone="error"
                containerStyle={styles.ultimoCampo}
              />

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              <Button
                label="Criar conta"
                variant="success"
                onPress={criar}
                loading={enviando}
                disabled={!senhaOk}
                style={styles.botao}
              />
            </Card>
          )}

          <Text style={styles.ajuda}>
            Criar a conta não gera cobrança. Você só paga ao escolher um plano no passo seguinte.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  voltarTexto: { ...type.small, color: colors.textMuted, fontWeight: '600' },

  topo: { alignItems: 'center', marginBottom: spacing.xl },
  icone: {
    width: 68,
    height: 68,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  titulo: { ...type.title, color: colors.text, marginTop: spacing.lg },
  subtitulo: {
    ...type.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  passos: { marginTop: spacing.lg },

  ultimoCampo: { marginBottom: spacing.sm },
  botao: { marginTop: spacing.md },

  erro: {
    ...type.small,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },

  ajuda: {
    ...type.tiny,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 18,
    fontWeight: '500',
  },
});
