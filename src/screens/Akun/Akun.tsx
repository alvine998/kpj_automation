import React from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import normalize from 'react-native-normalize';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {clearSession} from '../../utils/session';

export default function Akun() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const logout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearSession();
          navigation.reset({index: 0, routes: [{name: 'Login'}]});
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Akun</Text>
      <Text style={styles.subtitle}>Manage your account.</Text>

      <TouchableOpacity style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: '#111',
    marginBottom: normalize(6),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: normalize(14),
    color: '#666',
    textAlign: 'center',
    marginBottom: normalize(18),
  },
  button: {
    height: normalize(48),
    borderRadius: normalize(12),
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: normalize(15),
  },
});


