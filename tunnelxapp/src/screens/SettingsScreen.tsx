import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import * as WireGuard from '../native/WireGuard';
import {
  ArrowsClockwise,
  SignOut,
  ShieldCheck,
  FileZip,
  SquaresFour,
  ListDashes,
  Gear,
  CaretRight,
} from 'phosphor-react-native';
import { syncConnections } from '../services/sync';
import type { SessionClient } from '../storage/session';
import Screen from '../components/Screen';
import Card from '../components/Card';
import { colors, radius, spacing, type } from '../theme';
import { useLayout } from '../theme/useLayout';

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
              icon={<SignOut size={18} color={colors.danger} weight="duotone" />}
              title="Sair da conta"
              desc="Será necessário entrar de novo com CPF e senha"
              onPress={onLogout}
              tone="danger"
              last
            />
          </Card>
        ) : null}

        <Card label="Dispositivo" padded={false} style={styles.grupo}>
          <Item
            icon={<ShieldCheck size={18} color={colors.greenInk} weight="duotone" />}
            title="Permitir uso de VPN"
            desc="Solicita a permissão necessária para ativar túneis"
            onPress={onRequestVpnPermission}
          />
          <Item
            icon={<FileZip size={18} color={colors.textMuted} weight="duotone" />}
            title="Exportar túneis para arquivo zip"
            desc="O arquivo Zip será salvo na pasta de downloads"
            onPress={onExportZip}
          />
          <Item
            icon={<SquaresFour size={18} color={colors.textMuted} weight="duotone" />}
            title="Botão no painel rápido"
            desc="A tecla de atalho alterna o túnel mais recente"
            onPress={onAddQuickTile}
          />
          <Item
            icon={<ListDashes size={18} color={colors.textMuted} weight="duotone" />}
            title="Exibir registros da aplicação"
            desc="Registros podem ajudar na depuração"
            onPress={onShowLogs}
            last
          />
        </Card>

        <Card label="Avançado" padded={false} style={styles.grupo}>
          <Item
            icon={<Gear size={18} color={colors.textMuted} weight="duotone" />}
            title="Opções avançadas"
            desc="Controle remoto e diagnósticos"
            onPress={onAdvanced}
            last
          />
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
