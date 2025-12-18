import React, {useCallback, useEffect, useState} from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import normalize from 'react-native-normalize';
import {clearGeneratedKpj, loadGeneratedKpj} from '../../utils/kpjStorage';

export default function DataTerkumpul() {
  const [loading, setLoading] = useState(false);
  const [baseKpj11, setBaseKpj11] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [items, setItems] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadGeneratedKpj();
      setBaseKpj11(data?.baseKpj11 ?? null);
      setSavedAt(data?.savedAt ?? null);
      setItems(data?.generated ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Data Terkumpul</Text>
      {baseKpj11 ? (
        <Text style={styles.meta}>Base KPJ: {baseKpj11}</Text>
      ) : (
        <Text style={styles.subtitle}>No saved data yet.</Text>
      )}
      {savedAt ? (
        <Text style={styles.meta}>
          Saved at: {new Date(savedAt).toLocaleString()}
        </Text>
      ) : null}

      {items.length ? (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={async () => {
            await clearGeneratedKpj();
            await refresh();
          }}>
          <Text style={styles.clearButtonText}>Clear Saved Data</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={item => item}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({item, index}) => (
          <View style={styles.row}>
            <Text style={styles.rowIndex}>{index + 1}.</Text>
            <Text style={styles.rowValue}>{item}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Generate on Beranda → tap “Cari Data” to save locally.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: normalize(20),
    paddingTop: normalize(18),
  },
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(6),
    textAlign: 'center',
  },
  subtitle: {fontSize: normalize(14), color: '#666', textAlign: 'center'},
  meta: {
    fontSize: normalize(12),
    color: '#666',
    textAlign: 'center',
    marginBottom: normalize(6),
  },
  clearButton: {
    marginTop: normalize(10),
    marginBottom: normalize(10),
    height: normalize(44),
    borderRadius: normalize(12),
    borderWidth: 1,
    borderColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#ff3b30',
    fontWeight: '700',
    fontSize: normalize(14),
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
    textAlign: 'center',
  },
});


