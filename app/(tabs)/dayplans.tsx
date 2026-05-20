import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
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

import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { firebaseApp } from '@/firebaseInit';
import { addUserDayPlan, DayPlan, getUserDayPlans } from '@/services/firestoreService';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCurrency(value?: number) {
  const n = value ?? 0;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

export default function DayPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const loadPlans = async () => {
    try {
      setLoading(true);
      const uid = getUid();
      if (!uid) return;
      const data = await getUserDayPlans(uid);
      setPlans(data);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar roles.'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Titulo obrigatorio', text2: 'Informe o titulo do role.' });
      return;
    }
    try {
      setSaving(true);
      const uid = getUid();
      if (!uid) {
        Toast.show({ type: 'error', text1: 'Sessao expirada' });
        return;
      }
      await addUserDayPlan(uid, {
        title: title.trim(),
        date,
        notes: notes.trim(),
        createdAt: new Date().toISOString(),
        itemCount: 0,
        totalSpent: 0,
      });
      Toast.show({ type: 'success', text1: 'Role criado!' });
      setTitle('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setModalVisible(false);
      await loadPlans();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao criar',
        text2: getFirebaseErrorMessage(err, 'Nao foi possivel criar o role.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(getAuth(firebaseApp));
      router.replace('/auth/login');
    } catch {}
  };

  const openPlan = (plan: DayPlan) => {
    router.push(
      `/dayplan/${plan.id}?source=${plan._source}&title=${encodeURIComponent(plan.title ?? '')}&date=${plan.date ?? ''}`,
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Role do dia</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={loadPlans} style={styles.iconBtn}>
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
          data={plans}
          keyExtractor={(item) => `${item._source}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => openPlan(item)}>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.title ?? 'Sem titulo'}</Text>
                <Text style={styles.cardDetail}>Data: {formatDate(item.date)}</Text>
                <Text style={styles.cardDetail}>Locais escolhidos: {item.itemCount ?? 0}</Text>
                <Text style={styles.cardDetail}>Gasto do dia: {formatCurrency(item.totalSpent)}</Text>
              </View>
              <Pressable style={styles.moreBtn}>
                <Ionicons name="ellipsis-vertical" size={20} color="#666" />
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum role cadastrado ainda.</Text>}
        />
      )}

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="options-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Novo role</Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo role do dia</Text>
            <TextInput
              style={styles.input}
              placeholder="Titulo do role"
              value={title}
              onChangeText={setTitle}
            />
            <Pressable style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={TEAL} />
              <Text style={styles.dateText}>Data: {formatDate(date)}</Text>
            </Pressable>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Observacoes do dia"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar role'}</Text>
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
    backgroundColor: BG,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  list: { padding: 12, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  cardDetail: { fontSize: 13, color: '#555', marginBottom: 2 },
  moreBtn: { paddingLeft: 8, paddingTop: 2 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 420,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, color: '#1a1a1a' },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  dateText: { fontSize: 14, color: '#333' },
  saveBtn: {
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
