import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import normalize from 'react-native-normalize';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {saveGeneratedKpj} from '../../utils/kpjStorage';
import {loadSession} from '../../utils/session';
import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from 'firebase/firestore';
import {db} from '../../utils/firebase';

export default function Home() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [kpj11, setKpj11] = useState('');
  const [countText, setCountText] = useState('10');
  const [results, setResults] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [role, setRole] = useState<string | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<
    Array<{id: string; email?: string; role?: string; active?: boolean}>
  >([]);

  const prefix7 = useMemo(() => kpj11.replace(/\D/g, '').slice(0, 7), [kpj11]);

  const sanitizeDigits = (s: string) => s.replace(/\D/g, '');

  const random4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await loadSession();
      if (!mounted) return;
      setRole(session?.role ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      // NOTE: Using `where(role == 'user')` + `orderBy(createdAt)` requires a Firestore composite index.
      // To avoid manual index creation, we query by role only and sort locally.
      const q = query(collection(db, 'users'), where('role', '==', 'user'));
      const snap = await getDocs(q);
      const mapped = snap.docs.map(d => {
        const data = d.data() as {
          email?: string;
          role?: string;
          active?: boolean;
          createdAt?: any;
        };
        return {
          id: d.id,
          email: data.email,
          role: data.role,
          active: data.active,
          createdAt: data.createdAt,
        };
      });

      mapped.sort((a, b) => {
        const aMs =
          typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
        const bMs =
          typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
        return bMs - aMs;
      });

      setUsers(
        mapped.map(({createdAt, ...rest}) => rest),
      );
    } catch (e: any) {
      console.error('fetchUsers error:', e);
      Alert.alert('Error', e?.message ?? 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  const openUsers = async () => {
    setUsersOpen(true);
    await fetchUsers();
  };

  const toggleUserActive = async (userId: string, next: boolean) => {
    // Optimistic UI
    setUsers(prev => prev.map(u => (u.id === userId ? {...u, active: next} : u)));
    try {
      await updateDoc(doc(db, 'users', userId), {
        active: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      console.error('toggleUserActive error:', e);
      Alert.alert('Error', e?.message ?? 'Failed to update user.');
      // revert
      setUsers(prev => prev.map(u => (u.id === userId ? {...u, active: !next} : u)));
    }
  };

  const generate = async () => {
    if (isGenerating) return;

    const digits = sanitizeDigits(kpj11);
    if (digits.length !== 11) {
      Alert.alert('Invalid KPJ', 'KPJ number must be exactly 11 digits.');
      return;
    }

    const count = Number(sanitizeDigits(countText));
    if (!Number.isFinite(count) || count <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount to generate.');
      return;
    }
    if (count > 1000) {
      Alert.alert('Too many', 'Max 1000 numbers per generate.');
      return;
    }

    setIsGenerating(true);
    // Let UI render the spinner before heavy work
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    try {
      const prefix = digits.slice(0, 7);
      const set = new Set<string>();
      // Generate unique results as much as possible (max unique space = 10,000)
      const maxUnique = 10000;
      const target = Math.min(count, maxUnique);

      let guard = 0;
      while (set.size < target && guard < target * 20) {
        set.add(prefix + random4());
        guard++;
      }

      const list = Array.from(set);
      setResults(list);

      if (count > maxUnique) {
        Alert.alert(
          'Note',
          `Only 10,000 unique combinations are possible for the last 4 digits. Generated ${list.length}.`,
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const cariData = () => {
    if (!results.length) {
      Alert.alert('No data', 'Please generate KPJ first.');
      return;
    }

    const base = sanitizeDigits(kpj11);
    if (base.length !== 11) {
      Alert.alert('Invalid KPJ', 'KPJ number must be exactly 11 digits.');
      return;
    }

    saveGeneratedKpj({
      baseKpj11: base,
      generated: results,
      savedAt: Date.now(),
    })
      .then(() => {
        navigation.navigate('SippWebView');
      })
      .catch(e => {
        console.error('saveGeneratedKpj error:', e);
        Alert.alert('Error', 'Failed to save KPJ locally.');
      });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>KPJ Generator</Text>
        <Text style={styles.subtitle}>
          Keep first 7 digits, randomize last 4 digits.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>KPJ Number (11 digits)</Text>
        <TextInput
          style={styles.input}
          value={kpj11}
          onChangeText={t => setKpj11(sanitizeDigits(t).slice(0, 11))}
          keyboardType="number-pad"
          placeholder="Example: 12345678901"
          placeholderTextColor="#999"
          maxLength={11}
          editable={!isGenerating}
        />
        <Text style={styles.helperText}>Prefix (first 7): {prefix7 || '-'}</Text>

        <Text style={[styles.label, {marginTop: normalize(14)}]}>
          How many to generate
        </Text>
        <TextInput
          style={styles.input}
          value={countText}
          onChangeText={t => setCountText(sanitizeDigits(t).slice(0, 5))}
          keyboardType="number-pad"
          placeholder="Example: 10"
          placeholderTextColor="#999"
          editable={!isGenerating}
        />

        <TouchableOpacity
          style={[styles.button, isGenerating && styles.buttonDisabled]}
          onPress={generate}
          disabled={isGenerating}>
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Generate</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, isGenerating && styles.buttonDisabled]}
          onPress={cariData}
          disabled={isGenerating}>
          <Text style={styles.secondaryButtonText}>Cari Data</Text>
        </TouchableOpacity>

        {role === 'admin' ? (
          <TouchableOpacity
            style={[styles.adminButton, isGenerating && styles.buttonDisabled]}
            onPress={openUsers}
            disabled={isGenerating}>
            <Text style={styles.adminButtonText}>List Users</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          Results {results.length ? `(${results.length})` : ''}
        </Text>
        {results.length ? (
          <TouchableOpacity onPress={() => setResults([])}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={item => item}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        renderItem={({item, index}) => (
          <View style={styles.row}>
            <Text style={styles.rowIndex}>{index + 1}.</Text>
            <Text style={styles.rowValue}>{item}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Enter KPJ + amount, then tap Generate.
          </Text>
        }
      />

      <Modal
        visible={usersOpen}
        animationType="slide"
        onRequestClose={() => setUsersOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Users</Text>
            <TouchableOpacity onPress={() => setUsersOpen(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalRefresh, usersLoading && styles.buttonDisabled]}
              onPress={fetchUsers}
              disabled={usersLoading}>
              {usersLoading ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Text style={styles.modalRefreshText}>Refresh</Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={users}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.usersListContent}
            renderItem={({item}) => (
              <View style={styles.userRow}>
                <View style={styles.userInfo}>
                  <Text style={styles.userEmail}>{item.email ?? '(no email)'}</Text>
                  <Text style={styles.userMeta}>
                    Role: {item.role ?? '-'} • ID: {item.id}
                  </Text>
                </View>
                <View style={styles.userToggle}>
                  <Text style={styles.userActiveLabel}>
                    {item.active ? 'Active' : 'Inactive'}
                  </Text>
                  <Switch
                    value={!!item.active}
                    onValueChange={v => toggleUserActive(item.id, v)}
                  />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {usersLoading ? 'Loading...' : 'No users found.'}
              </Text>
            }
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: normalize(20),
    paddingTop: normalize(18),
  },
  header: {
    marginBottom: normalize(14),
  },
  title: {
    fontSize: normalize(24),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(4),
  },
  subtitle: {
    fontSize: normalize(14),
    color: '#666',
  },
  form: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: normalize(14),
    padding: normalize(14),
    backgroundColor: '#fff',
  },
  label: {
    fontSize: normalize(13),
    fontWeight: '700',
    color: '#222',
    marginBottom: normalize(8),
  },
  input: {
    height: normalize(48),
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: normalize(12),
    paddingHorizontal: normalize(14),
    fontSize: normalize(16),
    color: '#111',
    backgroundColor: '#f9f9f9',
  },
  helperText: {
    marginTop: normalize(8),
    fontSize: normalize(12),
    color: '#666',
  },
  button: {
    marginTop: normalize(16),
    height: normalize(48),
    borderRadius: normalize(12),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: normalize(15),
  },
  secondaryButton: {
    marginTop: normalize(12),
    height: normalize(48),
    borderRadius: normalize(12),
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: normalize(15),
  },
  adminButton: {
    marginTop: normalize(12),
    height: normalize(48),
    borderRadius: normalize(12),
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(15),
  },
  resultsHeader: {
    marginTop: normalize(16),
    marginBottom: normalize(8),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: '#111',
  },
  clearText: {
    fontSize: normalize(13),
    fontWeight: '700',
    color: '#007AFF',
  },
  listContent: {
    paddingBottom: normalize(24),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowIndex: {
    width: normalize(34),
    fontSize: normalize(13),
    color: '#666',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: normalize(15),
    color: '#111',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  emptyText: {
    paddingVertical: normalize(18),
    fontSize: normalize(13),
    color: '#888',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: normalize(12),
  },
  modalHeader: {
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: normalize(16),
    fontWeight: '800',
    color: '#111',
  },
  modalClose: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: '#007AFF',
  },
  modalActions: {
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(10),
  },
  modalRefresh: {
    height: normalize(42),
    borderRadius: normalize(10),
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRefreshText: {
    color: '#007AFF',
    fontWeight: '800',
    fontSize: normalize(14),
  },
  usersListContent: {
    paddingHorizontal: normalize(16),
    paddingBottom: normalize(24),
  },
  userRow: {
    flexDirection: 'row',
    gap: normalize(10),
    paddingVertical: normalize(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: normalize(14),
    fontWeight: '800',
    color: '#111',
    marginBottom: normalize(4),
  },
  userMeta: {
    fontSize: normalize(11),
    color: '#666',
  },
  userToggle: {
    alignItems: 'flex-end',
  },
  userActiveLabel: {
    fontSize: normalize(12),
    fontWeight: '700',
    color: '#333',
    marginBottom: normalize(4),
  },
});


