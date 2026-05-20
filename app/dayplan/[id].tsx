import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getAuth } from 'firebase/auth';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { getFirebaseErrorMessage } from '@/lib/firebaseErrorMessages';
import { firebaseApp } from '@/firebaseInit';
import {
    addDayPlanItem,
    DayPlanItem,
    DayPlanSource,
    getDayPlanItems,
    getUserPlaces,
} from '@/services/firestoreService';

const TEAL = '#1f7a6f';
const BG = '#eaf4f2';

type Place = { id: string; name?: string; location?: string };

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

export default function DayPlanDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, source, title, date } = useLocalSearchParams<{
    id: string;
    source: string;
    title: string;
    date: string;
  }>();
  const planSource = (source ?? 'user') as DayPlanSource;

  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<DayPlanItem[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [arrivalTime, setArrivalTime] = useState('09:00');
  const [leaveTime, setLeaveTime] = useState('10:00');
  const [amountSpent, setAmountSpent] = useState('0,00');
  const [itemNotes, setItemNotes] = useState('');

  const getUid = () => getAuth(firebaseApp).currentUser?.uid;

  const selectedPlace = useMemo(
    () => places.find((p) => p.id === selectedPlaceId),
    [places, selectedPlaceId],
  );

  const totalSpent = useMemo(
    () => items.reduce((acc, item) => acc + (item.amountSpent ?? 0), 0),
    [items],
  );

  const loadData = useCallback(async () => {
    const uid = getUid();
    if (!uid || !id) return;
    try {
      setLoadingItems(true);
      const [loadedItems, loadedPlaces] = await Promise.all([
        getDayPlanItems(uid, id, planSource),
        getUserPlaces(uid),
      ]);
      setItems(loadedItems);
      const typedPlaces = loadedPlaces as Place[];
      setPlaces(typedPlaces);
      if (!selectedPlaceId && typedPlaces.length > 0) {
        setSelectedPlaceId(typedPlaces[0].id);
      }
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Falha ao carregar dados.'),
      });
    } finally {
      setLoadingItems(false);
    }
  }, [id, planSource]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddItem = async () => {
    if (!selectedPlaceId) {
      Toast.show({ type: 'error', text1: 'Selecione um local' });
      return;
    }
    const parsedAmount = parseFloat(amountSpent.replace(',', '.'));
    if (!Number.isFinite(parsedAmount)) {
      Toast.show({ type: 'error', text1: 'Valor invalido', text2: 'Informe um numero valido.' });
      return;
    }
    try {
      setSaving(true);
      const uid = getUid();
      if (!uid) return;
      await addDayPlanItem(
        uid,
        id,
        {
          placeId: selectedPlaceId,
          placeName: selectedPlace?.name ?? '',
          placeLocation: selectedPlace?.location ?? '',
          arrivalTime,
          leaveTime,
          amountSpent: parsedAmount,
          notes: itemNotes.trim(),
          addedAt: new Date().toISOString(),
        },
        planSource,
      );
      Toast.show({ type: 'success', text1: 'Local adicionado!' });
      setAmountSpent('0,00');
      setItemNotes('');
      setArrivalTime('09:00');
      setLeaveTime('10:00');
      setModalVisible(false);
      await loadData();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: getFirebaseErrorMessage(err, 'Nao foi possivel adicionar.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Custom header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title ?? 'Role do dia'}
        </Text>
        <Pressable style={styles.iconBtn}>
          <Ionicons name="pencil-outline" size={22} color="#1a1a1a" />
        </Pressable>
      </View>

      {loadingItems ? (
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Planejamento do dia</Text>
              <Text style={styles.summaryDetail}>Data: {formatDate(date)}</Text>
              <Text style={styles.summaryDetail}>Total gasto: {formatCurrency(totalSpent)}</Text>
              <Text style={styles.summaryDetail}>Quantidade de paradas: {items.length}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.placeName ?? 'Local'}</Text>
                <Text style={styles.cardDetail}>Chegada: {item.arrivalTime ?? '-'}</Text>
                <Text style={styles.cardDetail}>Saida prevista: {item.leaveTime ?? '-'}</Text>
                <Text style={styles.cardDetail}>Gasto no local: {formatCurrency(item.amountSpent)}</Text>
                {!!(item as any).placeLocation && (
                  <Text style={styles.cardDetail}>Endereco: {(item as any).placeLocation}</Text>
                )}
              </View>
              <Pressable style={styles.moreBtn}>
                <Ionicons name="ellipsis-vertical" size={20} color="#666" />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum local adicionado ainda.</Text>}
        />
      )}

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>Adicionar local</Text>
      </Pressable>

      {/* Add item modal */}
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
            <Text style={styles.modalTitle}>Adicionar local ao role</Text>

            <Text style={styles.label}>Local</Text>
            <Pressable style={styles.picker} onPress={() => setPickerVisible(true)}>
              <Text style={styles.pickerText} numberOfLines={1}>
                {selectedPlace?.name ?? 'Selecione um local'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#666" />
            </Pressable>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Chegada</Text>
                <TextInput style={styles.input} value={arrivalTime} onChangeText={setArrivalTime} />
              </View>
              <View style={[styles.half, { marginLeft: 10 }]}>
                <Text style={styles.label}>Saida</Text>
                <TextInput style={styles.input} value={leaveTime} onChangeText={setLeaveTime} />
              </View>
            </View>

            <Text style={styles.label}>Quanto gastei no local</Text>
            <TextInput
              style={styles.input}
              value={amountSpent}
              onChangeText={setAmountSpent}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Observacoes</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Observacoes"
              value={itemNotes}
              onChangeText={setItemNotes}
              multiline
            />

            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={handleAddItem}
              disabled={saving}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar parada'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Place picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPickerVisible(false)}>
          <View style={[styles.modalCard, { maxHeight: '60%' }]}>
            <Text style={styles.modalTitle}>Selecionar local</Text>
            <ScrollView>
              {places.map((place) => (
                <Pressable
                  key={place.id}
                  style={[
                    styles.placeOption,
                    selectedPlaceId === place.id && styles.placeOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedPlaceId(place.id);
                    setPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.placeOptionText,
                      selectedPlaceId === place.id && { color: '#fff' },
                    ]}
                  >
                    {place.name ?? 'Sem nome'}
                  </Text>
                </Pressable>
              ))}
              {places.length === 0 && (
                <Text style={styles.empty}>Nenhum local cadastrado. Crie um local primeiro.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: BG,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  iconBtn: { padding: 4 },
  list: { padding: 12, paddingBottom: 100 },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    alignSelf: 'center',
    width: '70%',
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6, color: '#1a1a1a' },
  summaryDetail: { fontSize: 13, color: '#555', marginBottom: 2 },
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
  empty: { textAlign: 'center', color: '#888', marginTop: 20 },
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
  row: { flexDirection: 'row' },
  half: { flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 3, marginLeft: 1 },
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
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  pickerText: { fontSize: 14, color: '#333', flex: 1 },
  placeOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#f0f0f0',
  },
  placeOptionSelected: { backgroundColor: TEAL },
  placeOptionText: { fontSize: 15, color: '#1a1a1a' },
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
