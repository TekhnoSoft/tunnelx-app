import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  Image,
  Linking,
} from 'react-native';
import * as WireGuard from '../native/WireGuard';
import {
  ArrowsClockwise,
  SignOut,
  Receipt,
  ShieldCheck,
  Lock,
  FileText,
  CaretRight,
} from 'phosphor-react-native';
import { syncConnections } from '../services/sync';
import { cancelSubscription, fetchSubscription } from '../api/client';
import type { SessionClient } from '../storage/session';
import Screen from '../components/Screen';
import Card from '../components/Card';
import { colors, radius, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';
import { URL_PRIVACIDADE, URL_TERMOS } from '../config/legal';

async function abrir(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Não foi possível abrir', url);
  }
}

type Props = {
  client?: SessionClient | null;
  onSignOut?: (removerTuneis: boolean) => Promise<void> | void;
};

/** Iniciais para o avatar — o logo genérico não dizia de quem era a conta. */
function iniciais(nome?: string): string {
  if (!nome) return 'TX';
  const partes = nome.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? '';
  const b = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (a + b).toUpperCase() || 'TX';
}

function Item({
  icon,
  title,
  desc,
  onPress,
  tone,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onPress: () => void;
  tone?: 'danger';
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, !last && styles.itemLinha, pressed && styles.itemPress]}
    >
      <View style={styles.itemIcone}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemTitle, tone === 'danger' && styles.sair]}>{title}</Text>
        <Text style={styles.itemDesc}>{desc}</Text>
      </View>
      <CaretRight size={14} color={colors.textDim} />
    </Pressable>
  );
}

export default function SettingsScreen({ client, onSignOut }: Props) {
  const m = useLayout();

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

  /**
   * Cancelar mantém o que já foi pago: no Asaas a assinatura vai para INACTIVE
   * (para de gerar cobrança) e o acesso continua até o fim do período. Quem
   * pagou o mês usa o mês — cortar no clique geraria pedido de estorno.
   */
  const onCancelarAssinatura = async () => {
    let ate = '';
    try {
      const r = await fetchSubscription();
      if (!r.subscription || r.subscription.cancel_at_period_end) {
        Alert.alert('Assinatura', 'Você não tem uma assinatura ativa para cancelar.');
        return;
      }
      if (r.subscription.current_period_end) {
        ate = new Date(r.subscription.current_period_end).toLocaleDateString('pt-BR');
      }
    } catch (e: any) {
      Alert.alert('Assinatura', e?.message || 'Não foi possível consultar sua assinatura.');
      return;
    }

    Alert.alert(
      'Cancelar assinatura',
      ate
        ? `Sua conexão continua funcionando até ${ate}. Depois disso o acesso é encerrado.`
        : 'Sua assinatura será encerrada e o acesso será interrompido.',
      [
        { text: 'Manter assinatura', style: 'cancel' },
        {
          text: 'Cancelar assinatura',
          style: 'destructive',
          onPress: async () => {
            try {
              const r = await cancelSubscription();
              Alert.alert('Assinatura cancelada', r.message);
            } catch (e: any) {
              Alert.alert('Falha ao cancelar', e?.message || 'Tente novamente.');
            }
          },
        },
      ]
    );
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
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: m.gutter,
          paddingTop: m.paddingTop,
          paddingBottom: m.paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cartão de identidade: quem está logado, em vez do logo repetido. */}
        <Card style={styles.perfil}>
          <View style={styles.perfilLinha}>
            <View style={styles.avatar}>
              {client ? (
                <Text style={styles.avatarTexto}>{iniciais(client.name)}</Text>
              ) : (
                <Image source={require('../../logo.png')} style={styles.avatarLogo} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome} numberOfLines={1}>
                {client?.name || 'TunnelX'}
              </Text>
              <Text style={styles.doc}>
                {client?.cpf ? `CPF ${client.cpf}` : 'Cliente TunnelX'}
              </Text>
              {client?.cidade ? (
                <Text style={styles.local}>
                  {client.cidade}
                  {client.uf ? ` · ${client.uf}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {client ? (
          <Card label="Conta" padded={false} style={styles.grupo}>
            <Item
              icon={<ArrowsClockwise size={18} color={colors.primary} weight="duotone" />}
              title="Sincronizar minhas conexões"
              desc="Busca no servidor as conexões da sua conta e atualiza os túneis"
              onPress={onSync}
            />
            <Item
              icon={<Receipt size={18} color={colors.textMuted} weight="duotone" />}
              title="Cancelar assinatura"
              desc="O acesso continua até o fim do período já pago"
              onPress={onCancelarAssinatura}
            />
            <Item
              icon={<SignOut size={18} color={colors.danger} weight="duotone" />}
              title="Sair da conta"
              desc="Será necessário entrar de novo com CPF e senha"
              onPress={onLogout}
              tone="danger"
              last
            />
          </Card>
        ) : null}

        {/*
          Exportar zip, botão no painel rápido, exibir registros e opções
          avançadas saíram daqui: os quatro só abriam um alerta "Em breve".
          Funcionalidade anunciada que não funciona é reprovação por 2.1
          (App Completeness) — o revisor toca em cada item do menu.
          Quando forem implementadas de verdade, voltam.
        */}
        <Card label="Dispositivo" padded={false} style={styles.grupo}>
          <Item
            icon={<ShieldCheck size={18} color={colors.greenInk} weight="duotone" />}
            title="Permitir uso de VPN"
            desc="Solicita a permissão necessária para ativar túneis"
            onPress={onRequestVpnPermission}
            last
          />
        </Card>

        {/*
          Obrigatório para app de VPN.
          A diretriz 5.4 exige que a política de privacidade seja alcançável
          DENTRO do app — não basta preencher o campo na ficha da App Store — e
          que ela declare que o tráfego do túnel não é registrado, vendido nem
          compartilhado. Antes daqui não havia nenhuma URL externa no app todo.
        */}
        <Card label="Legal" padded={false} style={styles.grupo}>
          <Item
            icon={<Lock size={18} color={colors.textMuted} weight="duotone" />}
            title="Política de privacidade"
            desc="O que coletamos e como usamos"
            onPress={() => abrir(URL_PRIVACIDADE)}
            last={!URL_TERMOS}
          />
          {/* Sem URL configurada o item some: link 404 na revisão reprova. */}
          {URL_TERMOS ? (
            <Item
              icon={<FileText size={18} color={colors.textMuted} weight="duotone" />}
              title="Termos de uso"
              desc="Condições do serviço"
              onPress={() => abrir(URL_TERMOS)}
              last
            />
          ) : null}
        </Card>

        <Text style={styles.rodape}>TunnelX · conexão segura</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  perfil: { marginBottom: spacing.lg },
  perfilLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  avatarTexto: { ...type.heading, color: colors.primary, letterSpacing: 0.5 },
  avatarLogo: { width: 34, height: 34, resizeMode: 'contain' },
  nome: { ...type.title, fontSize: 19, color: colors.text },
  doc: { ...type.mono, color: colors.textMuted, marginTop: 3 },
  local: { ...type.tiny, color: colors.textDim, marginTop: 3, fontWeight: '500' },

  grupo: { marginBottom: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemLinha: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemPress: { opacity: 0.6 },
  itemIcone: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    // surfaceAlt, nao surface: estes quadrados ficam SOBRE card branco, e
    // branco no branco sumiria.
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { ...type.body, color: colors.text },
  itemDesc: { ...type.tiny, color: colors.textDim, marginTop: 2, fontWeight: '500', lineHeight: 15 },
  sair: { color: colors.danger },
  rodape: {
    ...type.label,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.md,
    opacity: 0.6,
  },
});
