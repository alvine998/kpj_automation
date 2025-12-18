import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kpj_automation.kpj_generated.v1';

export type GeneratedKpjPayload = {
  baseKpj11: string;
  generated: string[];
  savedAt: number; // epoch ms
};

export async function saveGeneratedKpj(payload: GeneratedKpjPayload): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

export async function loadGeneratedKpj(): Promise<GeneratedKpjPayload | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeneratedKpjPayload;
  } catch {
    return null;
  }
}

export async function clearGeneratedKpj(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}


