import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { firebaseApp } from '@/firebaseInit';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import {
  addBuddy,
  Buddy,
  BuddyRole,
  getBuddies,
  removeBuddy,
  updateBuddyRole,
} from '@/services/firestoreService';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

const ROLES: { value: BuddyRole; label: string; description: string; icon: string }[] = [
  {
    value: 'admin',
    label: 'Travel Planner',
    description: 'Adiciona locais, roles e vê relatórios',
    icon: 'briefcase-outline',
  },
  {
    value: 'user',
    label: 'Ride-along',
    description: 'Somente visualização',
    icon: 'eye-outline',
  },
];

function RoleBadge({ role }: { role: BuddyRole }) {
  const isAdmin = role === 'admin';
  return (
    <View style={[styles.badge, isAdmin ? styles.badgeAdmin : styles.badgeUser]}>
      <Ionicons
        name={isAdmin ? 'briefcase-outline' : 'eye-outline'}
        size={11}
        color={isAdmin ? '#1f7a6f' : '#7c3aed'}
      />
      <Text style={[styles.badgeText, isAdmin ? styles.badgeTextAdmin : styles.badgeTextUser]}>
        {isAdmin ? 'Travel Planner' : 'Ride-along'}
      </Text>
    </View>
  );
}

export default function BuddiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<BuddyRole>('user');
  const [optionsBuddyId, setOptionsBuddyId] = useState<string | null>(null);

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const loadBuddies = useCallback(async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid) return;
      const data = await getBuddies(uid);
      setBuddies(data);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar trip buddies.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusRefresh(loadBuddies);

  const handleAdd = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Toast.show({ type: 'error', text1: 'Email obrigatório', text2: 'Informe o email do buddy.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Toast.show({ type: 'error', text1: 'Email inválido', text2: 'Informe um email válido.' });
      return;
    }
    const uid = getUid();
    if (!uid) return;
    if (buddies.some((b) => b.email.toLowerCase() === trimmedEmail)) {
      Toast.show({ type: 'error', text1: 'Já adicionado', text2: 'Esse email já é um trip buddy.' });
      return;
    }
    try {
      setSaving(true);
      await addBuddy(uid, trimmedEmail, selectedRole);
      Toast.show({ type: 'success', text1: 'Trip buddy adicionado!' });
      setEmail('');
      setSelectedRole('user');
      setModalVisible(false);
      await loadBuddies();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao adicionar',
        text2: getFirebaseErrorMessage(err, 'Não foi possível adicionar.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (buddy: Buddy, newRole: BuddyRole) => {
    const uid = getUid();
    if (!uid) return;
    try {
      await updateBuddyRole(uid, buddy.id, newRole, buddy.firestoreId, buddy.email);
      setBuddies((prev) => prev.map((b) => (b.id === buddy.id ? { ...b, role: newRole } : b)));
      setOptionsBuddyId(null);
      Toast.show({ type: 'success', text1: 'Permissão atualizada!' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Não foi possível atualizar.') });
    }
  };

  const handleRemove = async (buddy: Buddy) => {
    const uid = getUid();
    if (!uid) return;
    try {
      setOptionsBuddyId(null);
      await removeBuddy(uid, buddy.id, buddy.firestoreId, buddy.email);
      setBuddies((prev) => prev.filter((b) => b.id !== buddy.id));
      Toast.show({ type: 'success', text1: 'Buddy removido.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Não foi possível remover.') });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(getAuth(firebaseApp));
      router.replace('/auth/login');
    } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Trip Buddies</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={loadBuddies} style={styles.iconBtn}>
            <Ionicons name="sync-outline" size={24} color="#333" />
          </Pressable>
          <Pressable onPress={handleLogout} style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={24} color="#333" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={buddies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <Ionicons name="person-outline" size={22} color={TEAL} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardEmail}>{item.email}</Text>
                  <RoleBadge role={item.role} />
                </View>
              </View>
              <Pressable
                onPress={() => setOptionsBuddyId(optionsBuddyId === item.id ? null : item.id)}
                style={styles.menuBtn}
              >
                <Ionicons name="ellipsis-vertical" size={20} color="#666" />
              </Pressable>

              {optionsBuddyId === item.id && (
                <View style={styles.optionsMenu}>
                  <Text style={styles.optionsTitle}>Alterar permissão</Text>
                  {ROLES.map((r) => (
                    <Pressable
                      key={r.value}
                      style={[styles.optionsItem, item.role === r.value && styles.optionsItemActive]}
                      onPress={() => handleChangeRole(item, r.value)}
                    >
                      <Ionicons
                        name={r.icon as any}
                        size={15}
                        color={item.role === r.value ? TEAL : '#555'}
                      />
                      <View>
                        <Text style={[styles.optionsItemLabel, item.role === r.value && { color: TEAL }]}>
                          {r.label}
                        </Text>
                        <Text style={styles.optionsItemDesc}>{r.description}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <View style={styles.optionsDivider} />
                  <Pressable style={styles.optionsItemRemove} onPress={() => handleRemove(item)}>
                    <Ionicons name="trash-outline" size={15} color="#e53935" />
                    <Text style={styles.optionsItemRemoveText}>Remover buddy</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={52} color="#ccc" />
              <Text style={styles.emptyText}>Nenhum trip buddy ainda.</Text>
              <Text style={styles.emptySubtext}>
                Adicione pessoas para compartilhar sua trip.
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="person-add-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Adicionar buddy</Text>
      </Pressable>

      {/* Modal adicionar buddy */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Novo Trip Buddy</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="email@exemplo.com"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            <Text style={styles.label}>Nível de acesso</Text>
            <View style={styles.roleSelector}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.value}
                  style={[styles.roleOption, selectedRole === r.value && styles.roleOptionActive]}
                  onPress={() => setSelectedRole(r.value)}
                >
                  <Ionicons
                    name={r.icon as any}
                    size={20}
                    color={selectedRole === r.value ? '#fff' : TEAL}
                  />
                  <Text style={[styles.roleLabel, selectedRole === r.value && styles.roleLabelActive]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.roleDesc, selectedRole === r.value && { color: 'rgba(255,255,255,0.85)' }]}>
                    {r.description}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.btnPrimary, saving && { opacity: 0.7 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Adicionar</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0eeec',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e0eeec',
    position: 'relative',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#eaf4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 6 },
  cardEmail: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  menuBtn: { padding: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  badgeAdmin: { backgroundColor: '#e6f4f1' },
  badgeUser: { backgroundColor: '#ede9fe' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextAdmin: { color: '#1f7a6f' },
  badgeTextUser: { color: '#7c3aed' },
  optionsMenu: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#e0eeec',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 220,
  },
  optionsTitle: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 6, paddingHorizontal: 4 },
  optionsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
  },
  optionsItemActive: { backgroundColor: '#eaf4f2' },
  optionsItemLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  optionsItemDesc: { fontSize: 11, color: '#888' },
  optionsDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 6 },
  optionsItemRemove: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8 },
  optionsItemRemoveText: { fontSize: 13, fontWeight: '600', color: '#e53935' },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#888', marginTop: 8 },
  emptySubtext: { fontSize: 13, color: '#aaa', textAlign: 'center', paddingHorizontal: 32 },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TEAL,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f5f9f8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#dde8e6',
  },
  roleSelector: { flexDirection: 'row', gap: 10, marginTop: 4 },
  roleOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TEAL,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
  },
  roleOptionActive: { backgroundColor: TEAL, borderColor: TEAL },
  roleLabel: { fontSize: 13, fontWeight: '700', color: TEAL, textAlign: 'center' },
  roleLabelActive: { color: '#fff' },
  roleDesc: { fontSize: 10, color: '#666', textAlign: 'center' },
  btnPrimary: {
    backgroundColor: TEAL,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
