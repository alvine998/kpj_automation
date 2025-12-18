import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import normalize from 'react-native-normalize';

export default function Home() {
  const [kpj11, setKpj11] = useState('');
  const [countText, setCountText] = useState('10');
  const [results, setResults] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const prefix7 = useMemo(() => kpj11.replace(/\D/g, '').slice(0, 7), [kpj11]);

  const sanitizeDigits = (s: string) => s.replace(/\D/g, '');

  const random4 = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

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
    // TODO: define behavior (API? search Firestore? open new screen?)
    Alert.alert('Cari Data', 'Tell me what source to search and what to show.');
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
});


