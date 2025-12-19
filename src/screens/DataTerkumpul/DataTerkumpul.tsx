import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import normalize from 'react-native-normalize';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';
import { db } from '../../utils/firebase';
import { loadSession } from '../../utils/session';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function DataTerkumpul() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'belum' | 'sudah'>('belum');
  const [items, setItems] = useState<
    Array<{
      id: string;
      kpj?: string;
      nik?: string;
      birthdate?: string;
      gender?: string;
      marritalStatus?: string;
      address?: string;
      phone?: string;
      npwp?: string;
      email?: string;
      createdAt?: any;
      name?: string;
      kelurahan?: string;
      kabupaten?: string;
      validasiLasik?: string | null;
      validasiDPT?: boolean;
    }>
  >([]);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      setUserId(session?.userId ?? null);
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'foundUser'),
        where('userId', '==', userId),
      );
      const snap = await getDocs(q);
      const mapped = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // sort locally by createdAt desc (avoid composite index requirements)
      mapped.sort((a, b) => {
        const aMs =
          typeof a.createdAt?.toMillis === 'function'
            ? a.createdAt.toMillis()
            : 0;
        const bMs =
          typeof b.createdAt?.toMillis === 'function'
            ? b.createdAt.toMillis()
            : 0;
        return bMs - aMs;
      });
      setItems(mapped);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'belum') {
      // Belum Cek DPT: validasiDPT is explicitly false
      return items.filter(x => x.validasiDPT === false);
    } else {
      // Sudah Cek DPT: validasiDPT is explicitly true
      return items.filter(x => x.validasiDPT === true);
    }
  }, [items, activeTab]);

  const total = items.length;
  const foundKpjCount = useMemo(
    () =>
      items.filter(x => typeof x.kpj === 'string' && x.kpj.length > 0).length,
    [items],
  );

  const formatForClipboard = useCallback(
    (item: (typeof items)[number]) => {
      // Plain text that pastes well into chat/notes.
      const lines: string[] = [];
      if (item.kpj) lines.push(`KPJ: ${item.kpj}`);
      if (item.name) lines.push(`Nama: ${item.name}`);
      if (item.nik) lines.push(`NIK: ${item.nik}`);
      if (item.birthdate) lines.push(`Tanggal Lahir: ${item.birthdate}`);
      if (item.gender) lines.push(`Jenis Kelamin: ${item.gender}`);
      if (item.marritalStatus)
        lines.push(`Status Perkawinan: ${item.marritalStatus}`);
      if (item.phone) lines.push(`No. HP: ${item.phone}`);
      if (item.email) lines.push(`Email: ${item.email}`);
      if (item.kabupaten) lines.push(`Kabupaten: ${item.kabupaten}`);
      if (item.kelurahan) lines.push(`Kelurahan: ${item.kelurahan}`);
      if (item.address) lines.push(`Alamat: ${item.address}`);
      if (item.validasiLasik === null) lines.push('Validasi LASIK: Belum Cek Lasik');
      if (item.validasiLasik === 'false') lines.push('Validasi LASIK: Tidak');
      if (item.validasiLasik === 'true') lines.push('Validasi LASIK: Ya');
      // Always include something so clipboard isn't empty.
      if (!lines.length) lines.push('-');
      return lines.join('\n');
    },
    [items],
  );

  const copyCard = useCallback(
    async (item: (typeof items)[number]) => {
      try {
        const text = formatForClipboard(item);
        Clipboard.setString(text);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Copied', ToastAndroid.SHORT);
        } else {
          Alert.alert('Copied', 'Card data copied to clipboard.');
        }
      } catch (e: any) {
        Alert.alert('Copy failed', e?.message ?? String(e));
      }
    },
    [formatForClipboard],
  );

  const confirmDelete = useCallback(
    (item: (typeof items)[number]) => {
      Alert.alert(
        'Hapus data?',
        `KPJ: ${item.kpj ?? '-'}\nNIK: ${item.nik ?? '-'}`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDoc(doc(db, 'foundUser', item.id));
                setItems(prev => prev.filter(x => x.id !== item.id));
                if (Platform.OS === 'android') {
                  ToastAndroid.show('Deleted', ToastAndroid.SHORT);
                } else {
                  Alert.alert('Deleted', 'Data removed.');
                }
              } catch (e: any) {
                Alert.alert('Delete failed', e?.message ?? String(e));
              }
            },
          },
        ],
      );
    },
    [setItems],
  );

  const copyValue = useCallback((label: string, raw: any) => {
    const value = String(raw ?? '').trim();
    if (!value || value === '-') return;
    Clipboard.setString(value);
    const msg = `${label} copied`;
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', msg);
    }
  }, []);

  const ValueText = ({ label, value }: { label: string; value: any }) => (
    <TouchableOpacity
      onPress={() => copyValue(label, value)}
      accessibilityRole="button"
      disabled={
        value == null ||
        String(value).trim() === '' ||
        String(value).trim() === '-'
      }
    >
      <Text style={styles.value}>{value ?? '-'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Data Terkumpul</Text>
        <Text style={styles.subtitle}>
          Total: {total} • Ditemukan: {foundKpjCount}
        </Text>
        <Text style={styles.userId} numberOfLines={1}>
          {userId ? `User: ${userId}` : 'User: -'}
        </Text>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'belum' && styles.tabActive]}
          onPress={() => setActiveTab('belum')}
          accessibilityRole="button">
          <Text
            style={[styles.tabText, activeTab === 'belum' && styles.tabTextActive]}>
            Belum Cek DPT
          </Text>
          {activeTab === 'belum' && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {filteredItems.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sudah' && styles.tabActive]}
          onPress={() => setActiveTab('sudah')}
          accessibilityRole="button">
          <Text
            style={[styles.tabText, activeTab === 'sudah' && styles.tabTextActive]}>
            Sudah Cek DPT
          </Text>
          {activeTab === 'sudah' && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {filteredItems.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.card,
              item.validasiLasik === 'false' && styles.cardBad,
              item.validasiLasik === 'true' &&
                styles.cardGood,
            ]}
          >
            <View style={styles.cardTop}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>#{index + 1}</Text>
              </View>
              <View style={styles.cardTopRight}>
                <TouchableOpacity
                  onPress={() => copyValue('KPJ', item.kpj)}
                  accessibilityRole="button"
                  disabled={!item.kpj}
                >
                  <Text style={styles.kpj}>{item.kpj ?? '-'}</Text>
                </TouchableOpacity>
                {item.name ? (
                  <TouchableOpacity
                    onPress={() => copyValue('Nama', item.name)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.name}>{item.name}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => confirmDelete(item)}
                  accessibilityRole="button"
                >
                  <Icon name="trash-can-outline" size={normalize(18)} color="#C62828" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => copyCard(item)}
                  accessibilityRole="button"
                >
                  <Text style={styles.copyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <Text style={styles.label}>NIK</Text>
                <ValueText label="NIK" value={item.nik ?? '-'} />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Tanggal Lahir</Text>
                <ValueText
                  label="Tanggal Lahir"
                  value={item.birthdate ?? '-'}
                />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Jenis Kelamin</Text>
                <ValueText label="Jenis Kelamin" value={item.gender ?? '-'} />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Status Perkawinan</Text>
                <ValueText
                  label="Status Perkawinan"
                  value={item.marritalStatus ?? '-'}
                />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>No. HP</Text>
                <ValueText label="No. HP" value={item.phone ?? '-'} />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Email</Text>
                <ValueText label="Email" value={item.email ?? '-'} />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Kabupaten</Text>
                <ValueText label="Kabupaten" value={item.kabupaten ?? '-'} />
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Kelurahan</Text>
                <ValueText label="Kelurahan" value={item.kelurahan ?? '-'} />
              </View>
            </View>

            {item.address ? (
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Alamat</Text>
                <TouchableOpacity
                  onPress={() => copyValue('Alamat', item.address)}
                  accessibilityRole="button"
                >
                  <Text style={styles.addressValue}>{item.address}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.validLasikBlock}>
              {(() => {
                const lasik =
                  item.validasiLasik === 'true'
                    ? true
                    : item.validasiLasik === 'false'
                      ? false
                      : null;

                const text =
                  lasik === null
                    ? 'Belum Cek Lasik'
                    : lasik
                      ? 'Validasi Berhasil'
                      : 'Validasi Gagal';

                const iconName =
                  lasik === null ? null : lasik ? 'check-circle' : 'close-circle';
                const iconColor = lasik === true ? '#1E7D3A' : '#C62828';

                return (
                  <View style={styles.validLasikRow}>
                    <Text style={styles.validLasikLabel}>Validasi LASIK</Text>
                    <View style={styles.validLasikRight}>
                      <Text style={styles.validLasikValue}>{text}</Text>
                      {iconName ? (
                        <Icon
                          name={iconName}
                          size={normalize(18)}
                          color={iconColor}
                          style={styles.validLasikIcon}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Data belum tersedia.
          </Text>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (activeTab === 'belum') {
            navigation.navigate('DPTWebView');
          } else {
            navigation.navigate('LasikWebView');
          }
        }}
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>
          {activeTab === 'belum' ? 'Cek DPT' : 'Cek Lasik'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f7fb',
    paddingHorizontal: normalize(20),
    paddingTop: normalize(18),
  },
  header: {
    marginBottom: normalize(12),
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: normalize(12),
    padding: normalize(4),
    marginBottom: normalize(16),
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: normalize(10),
    paddingHorizontal: normalize(12),
    borderRadius: normalize(8),
    gap: normalize(6),
  },
  tabActive: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabBadge: {
    minWidth: normalize(20),
    height: normalize(20),
    borderRadius: normalize(10),
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: normalize(6),
  },
  tabBadgeText: {
    fontSize: normalize(11),
    fontWeight: '800',
    color: '#fff',
  },
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(6),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: normalize(16),
    color: '#444',
    textAlign: 'center',
    fontWeight: '600',
  },
  userId: {
    marginTop: normalize(6),
    fontSize: normalize(18),
    color: '#777',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: normalize(24),
    paddingTop: normalize(4),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: normalize(14),
    padding: normalize(14),
    marginBottom: normalize(12),
    borderWidth: 1,
    borderColor: '#eef0f4',
  },
  cardBad: {
    backgroundColor: '#FFE8E8',
    borderColor: '#FFD0D0',
  },
  cardGood: {
    backgroundColor: '#E9F8EF',
    borderColor: '#CFF0DA',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(10),
  },
  badge: {
    width: normalize(32),
    height: normalize(32),
    borderRadius: normalize(10),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: normalize(10),
  },
  badgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(12),
  },
  cardTopRight: {
    flex: 1,
  },
  copyBtn: {
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(8),
    borderRadius: normalize(10),
    backgroundColor: '#111',
    marginLeft: normalize(10),
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: normalize(10),
  },
  trashBtn: {
    width: normalize(34),
    height: normalize(34),
    borderRadius: normalize(12),
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FFD0D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: normalize(8),
  },
  copyBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(12),
    letterSpacing: 0.2,
  },
  kpj: {
    fontSize: normalize(16),
    fontWeight: '900',
    color: '#111',
  },
  name: {
    marginTop: normalize(2),
    fontSize: normalize(13),
    color: '#E85107',
    fontWeight: '800',
  },
  grid: {
    gap: normalize(6),
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: normalize(10),
  },
  label: {
    fontSize: normalize(16),
    color: '#666',
    fontWeight: '700',
  },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: normalize(16),
    color: '#111',
    fontWeight: '700',
  },
  addressBlock: {
    marginTop: normalize(10),
    paddingTop: normalize(10),
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addressLabel: {
    fontSize: normalize(16),
    color: '#666',
    fontWeight: '800',
    marginBottom: normalize(4),
  },
  addressValue: {
    fontSize: normalize(16),
    color: '#111',
    fontWeight: '600',
    lineHeight: normalize(16),
  },
  emptyText: {
    paddingVertical: normalize(18),
    fontSize: normalize(13),
    color: '#888',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: normalize(18),
    bottom: normalize(18),
    paddingHorizontal: normalize(18),
    paddingVertical: normalize(12),
    borderRadius: normalize(18),
    backgroundColor: '#007AFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: normalize(14),
    letterSpacing: 0.2,
  },
  validLasikBlock: {
    marginTop: normalize(10),
    paddingTop: normalize(10),
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  validLasikRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: normalize(10),
  },
  validLasikRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(8),
  },
  validLasikLabel: {
    fontSize: normalize(16),
    color: '#666',
    fontWeight: '800',
    marginBottom: normalize(4),
  },
  validLasikValue: {
    fontSize: normalize(16),
    color: '#111',
    fontWeight: '600',
    lineHeight: normalize(16),
  },
  validLasikIcon: {
    marginLeft: normalize(6),
  },
});
