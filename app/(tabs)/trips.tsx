import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

import { BG, shadowCard, shadowFab, TEAL } from '@/constants/AppTheme';
import { useAuth } from '@/context/AuthContext';
import { useFocusRefresh } from '@/hooks/use-focus-refresh';
import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { addUserTrip, deleteUserTrip, getUserTrips, Trip, updateUserTrip } from '@/services/firestoreService';
import { pullFromFirestore, pushQueueToFirestore } from '@/services/syncService';
import { formatCurrency } from '@/utils/format';

export default function TripsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [optionsTripId, setOptionsTripId] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [maxCost, setMaxCost] = useState('0,00');

  const loadTrips = async () => {
    try {
      setLoading(true);
      if (!user) return;
      const data = await getUserTrips(user.uid);
      setTrips(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao carregar viagens.') });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = useCallback(async () => {
    try {
      setLoading(true);
      if (!user) return;
      await pushQueueToFirestore(user.uid);
      await pullFromFirestore(user.uid);
      const data = await getUserTrips(user.uid);
      setTrips(data);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro', text2: getFirebaseErrorMessage(err, 'Falha ao sincronizar.') });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusRefresh(handleSync);

  const resetForm = () => {
    setEditingTrip(null);
    setDescription('');
    setCountry('');
    setState('');
    setCity('');
    setMaxCost('0,00');
  };

  const parseCurrency = (val: string) =>
    parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;

  const openEditModal = (trip: Trip) => {
    setEditingTrip(trip);
    setDescription(trip.description ?? '');
    setCountry(trip.country ?? '');
    setState(trip.state ?? '');
    setCity(trip.city ?? '');
    setMaxCost(trip.maxCost.toFixed(2).replace('.', ','));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!description.trim()) {
      Toast.show({ type: 'error', text1: 'Campo obrigatório', text2: 'Informe uma descrição para a viagem.' });
      return;
    }
    try {
      setSaving(true);
      if (!user) return;
      const payload = {
        description: description.trim(),
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
        maxCost: parseCurrency(maxCost),
        createdAt: editingTrip?.createdAt ?? new Date().toISOString(),
      };
      if (editingTrip) {
        await updateUserTrip(user.uid, editingTrip.id, payload, editingTrip.firestoreId);
        Toast.show({ type: 'success', text1: 'Viagem atualizada!' });
      } else {
        await addUserTrip(user.uid, payload);
        await pushQueueToFirestore(user.uid);
        Toast.show({ type: 'success', text1: 'Viagem criada!' });
      }
      resetForm();
      setModalVisible(false);
      await loadTrips();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao salvar', text2: getFirebaseErrorMessage(err, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (trip: Trip) => {
    setOptionsTripId(null);
    if (!user) return;
    try {
      await deleteUserTrip(user.uid, trip.id, trip.firestoreId);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
      Toast.show({ type: 'success', text1: 'Viagem excluída.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Erro ao excluir', text2: getFirebaseErrorMessage(err, 'Não foi possível excluir.') });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace('/auth/login');
    } catch {}
  };

  const renderTrip = ({ item }: { item: Trip }) => {
    const isShared = !!item.ownerUid;
    return (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/trip/[id]',
          params: { id: item.id, title: item.description ?? 'Viagem', maxCost: String(item.maxCost ?? 0) },
        })
      }
      onLongPress={() => !isShared && setOptionsTripId(item.id)}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          {isShared && (
            <View style={styles.sharedBadge}>
              <Ionicons name="people-outline" size={11} color="#fff" />
              <Text style={styles.sharedBadgeText}>Compartilhada</Text>
            </View>
          )}
          <Text style={styles.cardTitle}>{item.description ?? '(sem título)'}</Text>
        </View>
        {!isShared && (
          <Pressable onPress={() => setOptionsTripId(item.id)} style={styles.moreBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color="#555" />
          </Pressable>
        )}
      </View>
      {(item.country || item.city) ? (
        <Text style={styles.cardSub}>
          {[item.city, item.state, item.country].filter(Boolean).join(', ')}
        </Text>
      ) : null}
      <Text style={styles.cardBudget}>Orçamento: {formatCurrency(item.maxCost)}</Text>

      {!isShared && optionsTripId === item.id && (
        <View style={styles.optionsRow}>
          <Pressable style={styles.optionBtn} onPress={() => { setOptionsTripId(null); openEditModal(item); }}>
            <Ionicons name="create-outline" size={18} color={TEAL} />
            <Text style={styles.optionText}>Editar</Text>
          </Pressable>
          <Pressable style={styles.optionBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={18} color="#c0392b" />
            <Text style={[styles.optionText, { color: '#c0392b' }]}>Excluir</Text>
          </Pressable>
          <Pressable style={styles.optionBtn} onPress={() => setOptionsTripId(null)}>
            <Ionicons name="close-outline" size={18} color="#555" />
            <Text style={styles.optionText}>Cancelar</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Minhas Viagens</Text>
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
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <Text style={styles.empty}>Nenhuma viagem cadastrada.{'\n'}Toque em + para criar uma.</Text>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => { resetForm(); setModalVisible(true); }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editingTrip ? 'Editar Viagem' : 'Nova Viagem'}</Text>

              <Text style={styles.label}>Descrição *</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Ex: Argentina 2026"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>País</Text>
              <TextInput
                style={styles.input}
                value={country}
                onChangeText={setCountry}
                placeholder="Ex: Argentina"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>Estado / Província</Text>
              <TextInput
                style={styles.input}
                value={state}
                onChangeText={setState}
                placeholder="Ex: Buenos Aires"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>Cidade</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="Ex: Buenos Aires"
                placeholderTextColor="#aaa"
              />

              <Text style={styles.label}>Orçamento máximo (R$)</Text>
              <TextInput
                style={styles.input}
                value={maxCost}
                onChangeText={setMaxCost}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#aaa"
              />

              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Salvar</Text>}
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => { resetForm(); setModalVisible(false); }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#ddd',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#222' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 12, ...shadowCard,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  moreBtn: { padding: 4 },
  cardSub: { fontSize: 13, color: '#666', marginTop: 2 },
  cardBudget: { fontSize: 13, color: TEAL, fontWeight: '600', marginTop: 4 },
  sharedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4,
  },
  sharedBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  optionsRow: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  optionText: { fontSize: 14, color: TEAL },
  empty: { textAlign: 'center', color: '#888', marginTop: 60, lineHeight: 24 },
  fab: {
    position: 'absolute', right: 20, backgroundColor: TEAL,
    width: 56, height: 56, borderRadius: 28, alignItems: 'center',
    justifyContent: 'center', ...shadowFab,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' },
  label: { fontSize: 13, color: '#555', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12,
    fontSize: 15, color: '#222', backgroundColor: '#fafafa',
  },
  saveBtn: {
    backgroundColor: TEAL, borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', padding: 12, marginTop: 4 },
  cancelBtnText: { color: '#888', fontSize: 14 },
});
