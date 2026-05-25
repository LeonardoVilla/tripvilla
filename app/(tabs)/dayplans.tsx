import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { BG, shadowCard, shadowFab, shadowMenu, TEAL } from '@/constants/AppTheme';
import { useAuth } from '@/context/AuthContext';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { addUserDayPlan, DayPlan, deleteUserDayPlan, getUserDayPlans, getUserPlaces, getUserTrips, Trip, updateUserDayPlan } from '@/services/firestoreService';
import { pullFromFirestore } from '@/services/syncService';
import { formatDate, formatCurrency } from '@/utils/format';

export default function DayPlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [optionsPlanId, setOptionsPlanId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<DayPlan | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTripId, setEditTripId] = useState<string | null>(null);
  const [selectedOwnerUid, setSelectedOwnerUid] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [hasPlaces, setHasPlaces] = useState(false);
  const tripsRef = useRef<Trip[]>([]);

  // Derive ownerUid from the selected trip (shared trips have ownerUid set)
  useEffect(() => {
    const trip = tripsRef.current.find((t) => t.id === selectedTripId);
    setSelectedOwnerUid(trip?.ownerUid ?? null);
  }, [selectedTripId]);

  const loadPlans = async () => {
    try {
      setLoading(true);
      if (!user) return;
      const data = await getUserDayPlans(user.uid);
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

  const handleSync = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;
      await pullFromFirestore(user.uid);
      const [data, tripData, places] = await Promise.all([
        getUserDayPlans(user.uid),
        getUserTrips(user.uid),
        getUserPlaces(user.uid),
      ]);
      setPlans(data);
      tripsRef.current = tripData;
      setTrips(tripData);
      setHasPlaces(places.length > 0);
      if (tripData.length === 1 && !selectedTripId) setSelectedTripId(tripData[0].id);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao sincronizar.') });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPlans();
    if (user) {
      getUserTrips(user.uid).then((data) => {
        tripsRef.current = data;
        setTrips(data);
        if (data.length === 1) setSelectedTripId(data[0].id);
      });
      getUserPlaces(user.uid).then((places) => setHasPlaces(places.length > 0));
    }
  }, [user]);

  const handleCreate = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Título obrigatório', text2: 'Informe o título do role.' });
      return;
    }
    if (!selectedTripId) {
      Toast.show({ type: 'error', text1: 'Viagem obrigatória', text2: 'Selecione a viagem deste role.' });
      return;
    }
    try {
      setSaving(true);
      if (!user) {
        Toast.show({ type: 'error', text1: 'Sessão expirada' });
        return;
      }
      await addUserDayPlan(user.uid, {
        title: title.trim(),
        date,
        notes: notes.trim(),
        tripId: selectedTripId,
        createdAt: new Date().toISOString(),
        itemCount: 0,
        totalSpent: 0,
      }, selectedOwnerUid ?? undefined);
      Toast.show({ type: 'success', text1: 'Role criado!' });
      setTitle('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setSelectedOwnerUid(null);
      setSelectedTripId(null);
      setModalVisible(false);
      await loadPlans();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao criar',
        text2: getFirebaseErrorMessage(err, 'Não foi possível criar o role.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/auth/login');
    } catch {}
  };

  const openPlan = (plan: DayPlan) => {
    router.push(
      `/dayplan/${plan.id}?source=${plan._source}&title=${encodeURIComponent(plan.title ?? '')}&date=${plan.date ?? ''}`,
    );
  };

  const openEditPlanModal = (plan: DayPlan) => {
    setEditingPlan(plan);
    setEditTitle(plan.title ?? '');
    setEditDate(plan.date ?? new Date().toISOString().slice(0, 10));
    setEditNotes(plan.notes ?? '');
    setEditTripId(plan.tripId ?? null);
    setOptionsPlanId(null);
    setEditModalVisible(true);
  };

  const handleUpdatePlan = async () => {
    if (!editTitle.trim()) {
      Toast.show({ type: 'error', text1: 'Título obrigatório' });
      return;
    }
    try {
      setSaving(true);
      if (!user || !editingPlan) return;
      await updateUserDayPlan(user.uid, editingPlan.id, {
        title: editTitle.trim(),
        date: editDate,
        notes: editNotes.trim(),
        tripId: editTripId,
      }, editingPlan.firestoreId);
      Toast.show({ type: 'success', text1: 'Role atualizado!' });
      setEditModalVisible(false);
      await loadPlans();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao atualizar',
        text2: getFirebaseErrorMessage(err, 'Não foi possível atualizar.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (plan: DayPlan) => {
    setOptionsPlanId(null);
    if (!user) return;
    try {
      await deleteUserDayPlan(user.uid, plan.id, plan.firestoreId);
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      Toast.show({ type: 'success', text1: 'Role excluído.' });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao excluir',
        text2: getFirebaseErrorMessage(err, 'Não foi possível excluir.'),
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Role do dia</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleSync} style={styles.iconBtn}>
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
          renderItem={({ item }) => {
            const trip = trips.find((t) => t.id === item.tripId);
            const isShared = item._source === 'root';
            return (
            <Pressable style={styles.card} onPress={() => openPlan(item)}>
              <View style={styles.cardContent}>
                {(trip || isShared) ? (
                  <View style={styles.tripBadgeRow}>
                    {trip && (
                      <View style={styles.tripBadge}>
                        <Ionicons name="airplane-outline" size={11} color={TEAL} />
                        <Text style={styles.tripBadgeText}>{trip.description}</Text>
                      </View>
                    )}
                    {isShared && (
                      <View style={styles.sharedBadge}>
                        <Ionicons name="people-outline" size={10} color="#fff" />
                        <Text style={styles.sharedBadgeText}>Compartilhado</Text>
                      </View>
                    )}
                  </View>
                ) : null}
                <Text style={styles.cardName}>{item.title ?? 'Sem título'}</Text>
                <Text style={styles.cardDetail}>📅 {formatDate(item.date)}</Text>
                <Text style={styles.cardDetail}>📍 {item.itemCount ?? 0} local(is)</Text>
                <Text style={styles.cardDetail}>💰 {formatCurrency(item.totalSpent)}</Text>
              </View>
              {!isShared && (
                <View style={styles.moreBtn}>
                  <Pressable onPress={() => setOptionsPlanId(optionsPlanId === item.id ? null : item.id)}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#666" />
                  </Pressable>
                  {optionsPlanId === item.id && (
                    <View style={styles.optionsMenu}>
                      <Pressable style={styles.optionsMenuItem} onPress={() => openEditPlanModal(item)}>
                        <Ionicons name="create-outline" size={16} color="#333" />
                        <Text style={styles.optionsMenuText}>Editar</Text>
                      </Pressable>
                      <Pressable style={styles.optionsMenuItem} onPress={() => handleDeletePlan(item)}>
                        <Ionicons name="trash-outline" size={16} color="#e53935" />
                        <Text style={[styles.optionsMenuText, { color: '#e53935' }]}>Excluir</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <Text style={styles.empty}>Nenhum role cadastrado ainda.</Text>
              {trips.length === 0 ? (
                <Text style={styles.emptyHint}>Cadastre uma viagem primeiro.</Text>
              ) : !hasPlaces ? (
                <Text style={styles.emptyHint}>Cadastre ao menos um local antes de criar roles.</Text>
              ) : (
                <Text style={styles.emptyHint}>Toque em "Novo role" para começar.</Text>
              )}
            </View>
          )}
        />
      )}

      {trips.length > 0 && hasPlaces && (
        <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
          <Ionicons name="options-outline" size={20} color="#fff" />
          <Text style={styles.fabText}>Novo role</Text>
        </Pressable>
      )}

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
            <Text style={styles.ownerLabel}>Viagem *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.ownerChip, selectedTripId === t.id && styles.ownerChipSelected]}
                  onPress={() => setSelectedTripId(t.id)}
                >
                  <Ionicons name="airplane-outline" size={13} color={selectedTripId === t.id ? '#fff' : TEAL} />
                  <Text style={[styles.ownerChipText, selectedTripId === t.id && styles.ownerChipTextSelected]}>
                    {t.description || 'Viagem'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Título do role"
              value={title}
              onChangeText={setTitle}
            />
            <Pressable style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={TEAL} />
              <Text style={styles.dateText}>Data: {formatDate(date)}</Text>
            </Pressable>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Observações do dia"
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

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditModalVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar role</Text>
            <Text style={styles.ownerLabel}>Viagem *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {trips.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.ownerChip, editTripId === t.id && styles.ownerChipSelected]}
                  onPress={() => setEditTripId(t.id)}
                >
                  <Ionicons name="airplane-outline" size={13} color={editTripId === t.id ? '#fff' : TEAL} />
                  <Text style={[styles.ownerChipText, editTripId === t.id && styles.ownerChipTextSelected]}>{t.description}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Título do role"
              value={editTitle}
              onChangeText={setEditTitle}
            />
            <Pressable style={styles.datePicker}>
              <Ionicons name="calendar-outline" size={16} color={TEAL} />
              <Text style={styles.dateText}>Data: {formatDate(editDate)}</Text>
            </Pressable>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Observações do dia"
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
            />
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleUpdatePlan}
              disabled={saving}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar alterações'}</Text>
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
    ...shadowCard,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  cardDetail: { fontSize: 13, color: '#555', marginBottom: 2 },
  moreBtn: { paddingLeft: 8, paddingTop: 2, position: 'relative', alignItems: 'center' },
  optionsMenu: {
    position: 'absolute',
    right: 0,
    top: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 120,
    zIndex: 100,
    ...shadowMenu,
  },
  optionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionsMenuText: { fontSize: 14, color: '#333' },
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
    ...shadowFab,
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
  ownerLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  ownerChip: {
    borderWidth: 1,
    borderColor: TEAL,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    backgroundColor: '#f0faf8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ownerChipSelected: { borderColor: TEAL, backgroundColor: TEAL },
  ownerChipText: { fontSize: 13, color: TEAL, fontWeight: '600' },
  ownerChipTextSelected: { color: '#fff', fontWeight: '700' },
  tripBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tripBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tripBadgeText: { fontSize: 11, color: TEAL, fontWeight: '600', textTransform: 'uppercase' },
  sharedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
  },
  sharedBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 40, gap: 8 },
  emptyHint: { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 4, paddingHorizontal: 32 },
});
