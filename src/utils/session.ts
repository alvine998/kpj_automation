import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserSession = {
  userId: string;
  email?: string;
  role?: string;
  active?: boolean;
};

const SESSION_KEY = 'kpj_automation.session.v1';

export async function saveSession(session: UserSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<UserSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}


