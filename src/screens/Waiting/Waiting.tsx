import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import normalize from 'react-native-normalize';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {doc, getDoc} from 'firebase/firestore';
import {db} from '../../utils/firebase';
import type {RootStackParamList} from '../../../App';
import {clearSession, saveSession} from '../../utils/session';
import Clipboard from '@react-native-clipboard/clipboard';

type Props = NativeStackScreenProps<RootStackParamList, 'Waiting'>;

export default function Waiting({navigation, route}: Props) {
  const {userId} = route.params;
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const userRef = useMemo(() => doc(db, 'users', userId), [userId]);

  const copyUid = useCallback(() => {
    const uid = String(userId ?? '').trim();
    if (!uid) return;
    Clipboard.setString(uid);
    const msg = 'UID copied';
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert('Copied', msg);
  }, [userId]);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        setIsActive(null);
        setEmail(null);
        Alert.alert('Not found', 'User record not found. Please sign up again.');
        navigation.replace('Login');
        return;
      }

      const data = snap.data() as {active?: boolean; email?: string; role?: string};
      setIsActive(typeof data.active === 'boolean' ? data.active : null);
      setEmail(typeof data.email === 'string' ? data.email : null);
      setRole(typeof data.role === 'string' ? data.role : null);

      if (data.active === true) {
        await saveSession({
          userId,
          email: typeof data.email === 'string' ? data.email : undefined,
          role: typeof data.role === 'string' ? data.role : undefined,
          active: true,
        });
        navigation.reset({
          index: 0,
          routes: [{name: 'MainTabs'}],
        });
      }
    } catch (e: any) {
      console.error('Waiting checkStatus error:', e);
      Alert.alert('Error', e?.message ?? 'Failed to check status.');
    } finally {
      setIsLoading(false);
    }
  }, [navigation, userRef]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Poll every 5 seconds while waiting (lightweight, can be replaced by onSnapshot later)
  useEffect(() => {
    const id = setInterval(() => {
      checkStatus();
    }, 5000);
    return () => clearInterval(id);
  }, [checkStatus]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Menunggu persetujuan</Text>
        <Text style={styles.subtitle}>
          Akun Anda perlu diaktifkan oleh admin.
        </Text>

        {email ? <Text style={styles.email}>{email}</Text> : null}
        {role ? <Text style={styles.role}>Role: {role}</Text> : null}

        <TouchableOpacity
          onPress={copyUid}
          accessibilityRole="button"
          disabled={!userId}
          style={styles.uidBlock}>
          <Text style={styles.uidLabel}>UID (tap to copy)</Text>
          <Text style={styles.uidValue} selectable>
            {userId}
          </Text>
        </TouchableOpacity>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              isActive ? styles.dotActive : styles.dotPending,
            ]}
          />
          <Text style={styles.statusText}>
            {isActive === true
              ? 'Aktif'
              : isActive === false
                ? 'Menunggu aktivasi'
                : 'Checking...'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.disabledButton]}
          onPress={checkStatus}
          disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Refresh</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={async () => {
            await clearSession();
            navigation.replace('Login');
          }}
          disabled={isLoading}>
          <Text style={styles.secondaryButtonText}>Kembali ke Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: normalize(20),
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: normalize(16),
    padding: normalize(20),
    backgroundColor: '#fff',
  },
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(8),
  },
  subtitle: {
    fontSize: normalize(14),
    color: '#666',
    marginBottom: normalize(14),
  },
  email: {
    fontSize: normalize(14),
    color: '#111',
    fontWeight: '600',
    marginBottom: normalize(16),
  },
  role: {
    fontSize: normalize(13),
    color: '#666',
    marginTop: normalize(-10),
    marginBottom: normalize(16),
  },
  uidBlock: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: normalize(12),
    padding: normalize(12),
    backgroundColor: '#fafafa',
    marginBottom: normalize(14),
  },
  uidLabel: {
    fontSize: normalize(12),
    color: '#666',
    fontWeight: '700',
    marginBottom: normalize(6),
  },
  uidValue: {
    fontSize: normalize(18),
    color: '#111',
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(20),
  },
  dot: {
    width: normalize(10),
    height: normalize(10),
    borderRadius: normalize(10),
    marginRight: normalize(10),
  },
  dotPending: {backgroundColor: '#f5a623'},
  dotActive: {backgroundColor: '#2ecc71'},
  statusText: {
    fontSize: normalize(14),
    color: '#333',
    fontWeight: '500',
  },
  primaryButton: {
    height: normalize(48),
    borderRadius: normalize(12),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: normalize(15),
  },
  secondaryButton: {
    height: normalize(48),
    borderRadius: normalize(12),
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: normalize(12),
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: normalize(15),
  },
});


