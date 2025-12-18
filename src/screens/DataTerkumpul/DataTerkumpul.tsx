import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import normalize from 'react-native-normalize';
import {collection, getDocs, query, where} from 'firebase/firestore';
import {db} from '../../utils/firebase';
import {loadSession} from '../../utils/session';

export default function DataTerkumpul() {
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
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
      const mapped = snap.docs.map(d => ({id: d.id, ...(d.data() as any)}));
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

  const total = items.length;
  const foundKpjCount = useMemo(
    () =>
      items.filter(x => typeof x.kpj === 'string' && x.kpj.length > 0).length,
    [items],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Data Terkumpul</Text>
        <Text style={styles.subtitle}>Total: {total} • Found: {foundKpjCount}</Text>
        <Text style={styles.userId} numberOfLines={1}>
          {userId ? `User: ${userId}` : 'User: -'}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({item, index}) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>#{index + 1}</Text>
              </View>
              <View style={styles.cardTopRight}>
                <Text style={styles.kpj}>{item.kpj ?? '-'}</Text>
                {item.name ? <Text style={styles.name}>{item.name}</Text> : null}
              </View>
            </View>

            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <Text style={styles.label}>NIK</Text>
                <Text style={styles.value}>{item.nik ?? '-'}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Birthdate</Text>
                <Text style={styles.value}>{item.birthdate ?? '-'}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Gender</Text>
                <Text style={styles.value}>{item.gender ?? '-'}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Marital</Text>
                <Text style={styles.value}>{item.marritalStatus ?? '-'}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{item.phone ?? '-'}</Text>
              </View>
              <View style={styles.gridRow}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{item.email ?? '-'}</Text>
              </View>
            </View>

            {item.address ? (
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Address</Text>
                <Text style={styles.addressValue}>{item.address}</Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No data yet. Run WebView process until it saves to Firestore
            `foundUser`.
          </Text>
        }
      />
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
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(6),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: normalize(13),
    color: '#444',
    textAlign: 'center',
    fontWeight: '600',
  },
  userId: {
    marginTop: normalize(6),
    fontSize: normalize(11),
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
    fontSize: normalize(12),
    color: '#666',
    fontWeight: '700',
  },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: normalize(12),
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
    fontSize: normalize(12),
    color: '#666',
    fontWeight: '800',
    marginBottom: normalize(4),
  },
  addressValue: {
    fontSize: normalize(12),
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
});
