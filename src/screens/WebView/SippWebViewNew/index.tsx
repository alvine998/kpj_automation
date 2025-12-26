/**
 * BPJS SIPP Automation - Clean Implementation
 * 
 * This is a fresh, modular implementation of BPJS SIPP web automation
 * following best practices and clear separation of concerns.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import normalize from 'react-native-normalize';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../../App';

import { loadGeneratedKpj } from '../../../utils/kpjStorage';
import { loadSession } from '../../../utils/session';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../utils/firebase';

import {
  AutomationState,
  AutomationStep,
  AutomationLog,
  AutomationProgress,
  Step8Result,
  Step9Result,
  WebViewMessage,
  AutomationConfig,
  ProfileData,
} from './types';

import { DEFAULT_CONFIG, URLS } from './config';
import {
  createLog,
  normalizeUrl,
  isKpjFormUrl,
  isProfilePageUrl,
  withCacheBuster,
  parseWebViewMessage,
  validateStep9Result,
} from './utils';

import {
  createAutoRedirectScript,
  createSteps5to8Script,
  createProfileCheckScript,
  createStep9ExtractScript,
} from './scripts';

export default function SippWebViewNew() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  // Refs
  const webViewRef = useRef<WebView>(null);
  const configRef = useRef<AutomationConfig>(DEFAULT_CONFIG);
  const kpjListRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(0);
  const pendingStepRef = useRef<AutomationStep>(0);
  const lastStep5UrlRef = useRef<string | null>(null);
  const lastStep9UrlRef = useRef<string | null>(null);
  
  // Locks to prevent race conditions
  const step5LockRef = useRef<boolean>(false);
  const step9LockRef = useRef<boolean>(false);
  const profileCheckLockRef = useRef<boolean>(false);
  const step5StartTimeRef = useRef<number>(0);
  
  // State
  const [kpjList, setKpjList] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>(URLS.BASE);
  const [webSourceUrl, setWebSourceUrl] = useState<string>(URLS.BASE);
  const [automationState, setAutomationState] = useState<AutomationState>('idle');
  const [currentStep, setCurrentStep] = useState<AutomationStep>(0);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [progress, setProgress] = useState<AutomationProgress>({
    total: 0,
    checked: 0,
    found: 0,
    notFound: 0,
    currentIndex: 0,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const checkedSetRef = useRef<Set<string>>(new Set());

  // Initialize: Load data and session
  useEffect(() => {
    (async () => {
      const data = await loadGeneratedKpj();
      const kpjList = data?.generated ?? [];
      kpjListRef.current = kpjList;
      setKpjList(kpjList);
      setProgress(prev => ({ ...prev, total: kpjList.length }));
      
      const session = await loadSession();
      setUserId(session?.userId ?? null);
      setRole(session?.role ?? null);
      setDebugOpen(session?.role === 'admin');
    })();
  }, []);

  /**
   * Add log entry
   */
  const addLog = useCallback((message: string, type: AutomationLog['type'] = 'info') => {
    const log = createLog(message, type);
    setLogs(prev => [log, ...prev.slice(0, 79)]); // Keep last 80 logs
    console.log(`[BPJS Automation] ${log.timestamp} - ${message}`);
  }, []);

  /**
   * Mark KPJ as checked
   */
  const markChecked = useCallback((kpj: string) => {
    if (!kpj) return;
    checkedSetRef.current.add(kpj);
    setProgress(prev => ({
      ...prev,
      checked: checkedSetRef.current.size,
    }));
  }, []);

  /**
   * Inject JavaScript into WebView
   */
  const injectScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script);
  }, []);

  /**
   * Handle Step 5-8: Fill form and check result
   */
  const handleSteps5to8 = useCallback((kpj: string) => {
    if (step5LockRef.current) {
      addLog(`Step 5-8: Already in progress for KPJ ${kpj}`, 'warning');
      return;
    }

    step5LockRef.current = true;
    step5StartTimeRef.current = Date.now();

    // Safety timeout
    setTimeout(() => {
      step5LockRef.current = false;
    }, configRef.current.defaultTimeout);

    addLog(`Step 5-8: Starting for KPJ ${kpj}`);
    injectScript(createSteps5to8Script(kpj, configRef.current));
  }, [addLog, injectScript]);

  /**
   * Handle Step 9: Extract profile data
   */
  const handleStep9 = useCallback(() => {
    if (step9LockRef.current) {
      addLog('Step 9: Already in progress', 'warning');
      return;
    }

    step9LockRef.current = true;
    addLog('Step 9: Starting profile extraction', 'info');

    // Safety timeout
    setTimeout(() => {
      if (step9LockRef.current) {
        addLog('Step 9: Timeout - releasing lock', 'warning');
        step9LockRef.current = false;
      }
    }, configRef.current.defaultTimeout);

    injectScript(createStep9ExtractScript(configRef.current));
  }, [addLog, injectScript]);

  /**
   * Check if profile page is ready
   */
  const checkProfileReady = useCallback(() => {
    if (profileCheckLockRef.current) {
      return;
    }
    profileCheckLockRef.current = true;
    setTimeout(() => {
      profileCheckLockRef.current = false;
    }, 1000);
    
    injectScript(createProfileCheckScript());
  }, [injectScript]);

  /**
   * Handle Step 8 result
   */
  const handleStep8Result = useCallback((result: Step8Result) => {
    step5LockRef.current = false;
    
    markChecked(result.kpj);

    if (result.ok && result.found) {
      // FOUND: Proceed to Step 9
      addLog(`✅ FOUND: KPJ ${result.kpj}`, 'success');
      setProgress(prev => ({ ...prev, found: prev.found + 1 }));
      
      pendingStepRef.current = 9;
      setCurrentStep(9);
      lastStep9UrlRef.current = null;
      step9LockRef.current = false;
      
      // Wait for profile page to load, then check
      setTimeout(() => {
        if (pendingStepRef.current === 9 && !step9LockRef.current) {
          checkProfileReady();
        }
      }, 1500);
    } else if (result.ok && !result.found) {
      // Not found: Continue to next KPJ
      addLog(`Not found: KPJ ${result.kpj}`, 'info');
      setProgress(prev => ({ ...prev, notFound: prev.notFound + 1 }));
      
      continueToNextKpj();
    } else {
      // Error: Continue anyway
      addLog(`Step 8 error: ${result.reason ?? 'Unknown'}`, 'error');
      continueToNextKpj();
    }
  }, [addLog, markChecked, checkProfileReady]);

  /**
   * Handle Step 9 result
   */
  const handleStep9Result = useCallback(async (result: Step9Result) => {
    step9LockRef.current = false;

    if (result.ok && validateStep9Result(result)) {
      addLog(`Step 9: Profile extracted for KPJ ${result.kpj}`, 'success');

      // Save to Firestore
      try {
        if (!userId) {
          throw new Error('No userId in session');
        }

        const profileData: ProfileData = {
          kpj: result.kpj,
          nik: result.nik ?? '',
          name: result.name ?? '',
          birthdate: result.birthdate ?? '',
          gender: result.gender,
          marritalStatus: result.marritalStatus,
          address: result.address,
          postalCode: result.postalCode,
          phone: result.phone,
          npwp: result.npwp,
          email: result.email,
        };

        const dataToSave = {
          userId,
          ...profileData,
          validasiDPT: false,
          createdAt: serverTimestamp(),
          sourceUrl: currentUrl,
        };

        addLog(`Saving to Firestore: KPJ ${result.kpj}`, 'info');
        const ref = await addDoc(collection(db, 'foundUser'), dataToSave);
        addLog(`✅ Saved to Firestore: KPJ ${result.kpj} (docId: ${ref.id})`, 'success');

        if (Platform.OS === 'android') {
          ToastAndroid.show(`Data Berhasil Disimpan (KPJ: ${result.kpj})`, ToastAndroid.SHORT);
        } else {
          Alert.alert('Berhasil', `Data Berhasil Disimpan (KPJ: ${result.kpj})`);
        }
      } catch (error: any) {
        const errorMsg = `Firestore save error: ${error?.message ?? String(error)}`;
        addLog(errorMsg, 'error');
        if (Platform.OS === 'android') {
          ToastAndroid.show(errorMsg, ToastAndroid.LONG);
        } else {
          Alert.alert('Save Error', errorMsg);
        }
      }

      // Continue to next KPJ
      continueToNextKpj();
    } else {
      addLog(`Step 9 failed: ${result.reason ?? 'Invalid data'}`, 'error');
      continueToNextKpj();
    }
  }, [addLog, userId, currentUrl]);

  /**
   * Continue to next KPJ
   */
  const continueToNextKpj = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    currentIndexRef.current = nextIndex;
    setProgress(prev => ({ ...prev, currentIndex: nextIndex }));

    if (nextIndex >= kpjListRef.current.length) {
      // All done
      addLog('✅ All KPJs processed', 'success');
      setAutomationState('completed');
      pendingStepRef.current = 0;
      setCurrentStep(0);
    } else {
      // Continue with next KPJ
      pendingStepRef.current = 5;
      setCurrentStep(5);
      lastStep5UrlRef.current = null;
      setWebSourceUrl(withCacheBuster(`${URLS.FORM}#`));
      addLog(`Continuing to next KPJ: ${nextIndex + 1}/${kpjListRef.current.length}`);
    }
  }, [addLog]);

  /**
   * Start automation
   */
  const startAutomation = useCallback(() => {
    if (kpjListRef.current.length === 0) {
      Alert.alert('KPJ list empty', 'Go to Beranda → Generate → Cari Data');
      return;
    }

    addLog('🚀 Starting automation', 'info');
    setAutomationState('running');
    currentIndexRef.current = 0;
    setProgress({
      total: kpjListRef.current.length,
      checked: 0,
      found: 0,
      notFound: 0,
      currentIndex: 0,
    });
    checkedSetRef.current = new Set();

    pendingStepRef.current = 5;
    setCurrentStep(5);

    if (!isKpjFormUrl(currentUrl)) {
      setWebSourceUrl(URLS.FORM);
    } else {
      // Already on form, start immediately
      const kpj = kpjListRef.current[0];
      if (kpj) {
        handleSteps5to8(kpj);
      }
    }
  }, [currentUrl, addLog, handleSteps5to8]);

  /**
   * Stop automation
   */
  const stopAutomation = useCallback(() => {
    addLog('⏹️ Automation stopped', 'warning');
    setAutomationState('idle');
    pendingStepRef.current = 0;
    setCurrentStep(0);
    step5LockRef.current = false;
    step9LockRef.current = false;
  }, [addLog]);

  /**
   * Handle WebView page load
   */
  const handleLoadEnd = useCallback((url: string) => {
    setCurrentUrl(url);

    // Auto-redirect after login
    if (url && !isKpjFormUrl(url) && url.includes('sipp.bpjsketenagakerjaan.go.id')) {
      injectScript(createAutoRedirectScript(URLS.FORM));
    }

    // Step 5: Start processing current KPJ
    if (pendingStepRef.current === 5 && url) {
      const normalized = normalizeUrl(url);
      if (lastStep5UrlRef.current !== normalized && !step5LockRef.current) {
        lastStep5UrlRef.current = normalized;
        const kpj = kpjListRef.current[currentIndexRef.current];
        if (kpj) {
          addLog(`Step 5: Processing KPJ ${kpj} (${currentIndexRef.current + 1}/${kpjListRef.current.length})`);
          handleSteps5to8(kpj);
        }
      }
    }

    // Step 9: Check profile page ready
    if (pendingStepRef.current === 9 && url) {
      const normalized = normalizeUrl(url);
      if (!isKpjFormUrl(url) && !step9LockRef.current) {
        if (lastStep9UrlRef.current !== normalized) {
          lastStep9UrlRef.current = normalized;
          addLog('Step 9: Profile page loaded, checking fields');
          checkProfileReady();
        } else {
          checkProfileReady();
        }
      }
    }
  }, [addLog, handleSteps5to8, checkProfileReady]);

  /**
   * Handle WebView messages
   */
  const handleMessage = useCallback((event: any) => {
    const msg = parseWebViewMessage(event.nativeEvent.data);
    if (!msg) return;

    addLog(`Message received: type=${msg.type}, step=${msg.step ?? 'N/A'}`);

    // Handle profile check
    if (msg.type === 'profileCheck' && pendingStepRef.current === 9) {
      if (profileCheckLockRef.current) return;

      const url = msg.url || currentUrl;
      const isKpjForm = isKpjFormUrl(url);

      if (msg.ready && !isKpjForm && !step9LockRef.current) {
        addLog('✅ Profile fields ready, starting extraction');
        handleStep9();
      } else if (msg.ready && isKpjForm) {
        addLog('⚠️ Profile check says ready but still on form page, ignoring');
      } else {
        addLog(`⏳ Profile fields not ready yet (hasNik=${msg.hasNik}, hasBirthdate=${msg.hasBirthdate}, hasName=${msg.hasName})`);
        setTimeout(() => {
          if (pendingStepRef.current === 9 && !profileCheckLockRef.current) {
            checkProfileReady();
          }
        }, 2000);
      }
      return;
    }

    // Handle step messages
    if (msg.type === 'process' && msg.step) {
      switch (msg.step) {
        case 5:
          addLog(msg.ok ? 'Step 5: Clicked Sudah' : `Step 5 failed: ${msg.reason}`);
          break;

        case 6:
          addLog(msg.ok ? `Step 6: Input KPJ ${msg.kpj}` : `Step 6 failed: ${msg.reason}`);
          break;

        case 7:
          addLog(msg.ok ? 'Step 7: Clicked Lanjut' : `Step 7 failed: ${msg.reason}`);
          break;

        case 8:
          handleStep8Result({
            ok: msg.ok ?? false,
            found: msg.found ?? false,
            kpj: msg.kpj ?? '',
            cannotUse: msg.cannotUse,
            reason: msg.reason,
            text: msg.text,
          });
          break;

        case 9:
          handleStep9Result({
            ok: msg.ok ?? false,
            kpj: msg.kpj ?? '',
            nik: msg.nik,
            name: msg.name,
            birthdate: msg.birthdate,
            gender: msg.gender,
            marritalStatus: msg.marritalStatus,
            address: msg.address,
            postalCode: msg.postalCode,
            phone: msg.phone,
            npwp: msg.npwp,
            email: msg.email,
            reason: msg.reason,
          });
          break;
      }
    }

    // Handle unlock message
    if (msg.type === 'step9Unlock') {
      step9LockRef.current = false;
      addLog('Step 9 lock released (from JS)');
    }
  }, [addLog, currentUrl, handleStep8Result, handleStep9Result, handleStep9, checkProfileReady]);

  // Render
  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            SIPP
          </Text>
          <Text style={styles.topBarSubtitle} numberOfLines={1}>
            {normalizeUrl(currentUrl)}
          </Text>
          <Text style={styles.topBarProgress}>
            Progress: {progress.checked}/{progress.total} • Found: {progress.found} • Not found: {progress.notFound}
          </Text>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={[styles.button, automationState === 'running' && styles.buttonActive]}
            onPress={automationState === 'running' ? stopAutomation : startAutomation}
            disabled={automationState === 'running' && currentStep === 0}>
            <Text style={styles.buttonText}>
              {automationState === 'running' ? 'Stop' : 'Process'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => setListOpen(true)}>
            <Text style={styles.buttonText}>KPJ</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => setDebugOpen(!debugOpen)}>
            <Text style={styles.buttonText}>{debugOpen ? 'Hide' : 'Debug'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonDanger} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Debug Panel */}
      {debugOpen && (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Debug</Text>
          <Text style={styles.debugStats}>
            State: {automationState} • Step: {currentStep} • Current: {progress.currentIndex + 1}/{progress.total}
          </Text>
          <ScrollView style={styles.debugScroll}>
            {logs.map((log, idx) => (
              <Text key={idx} style={[styles.debugLine, log.type === 'error' && styles.debugError]}>
                {log.timestamp} {log.message}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: webSourceUrl }}
        onNavigationStateChange={nav => {
          if (nav?.url) {
            setCurrentUrl(nav.url);
            addLog(`Navigation: ${nav.url}`);
          }
        }}
        onLoadEnd={e => {
          const url = e?.nativeEvent?.url;
          if (url) {
            handleLoadEnd(url);
          }
        }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {/* Loading Indicator */}
      {automationState === 'running' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            Processing KPJ {progress.currentIndex + 1}/{progress.total}
          </Text>
        </View>
      )}

      {/* KPJ List Modal */}
      <Modal visible={listOpen} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>KPJ List</Text>
              <TouchableOpacity onPress={() => setListOpen(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={kpjList}
              keyExtractor={(item, index) => `${item}-${index}`}
              renderItem={({ item, index }) => (
                <View style={styles.kpjItem}>
                  <Text style={styles.kpjText}>{index + 1}. {item}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No KPJ saved yet</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  topBarLeft: {
    flex: 1,
    marginRight: normalize(16),
  },
  topBarTitle: {
    fontSize: normalize(18),
    fontWeight: 'bold',
    color: '#000',
  },
  topBarSubtitle: {
    fontSize: normalize(12),
    color: '#666',
    marginTop: normalize(4),
  },
  topBarProgress: {
    fontSize: normalize(12),
    color: '#007AFF',
    marginTop: normalize(4),
  },
  topBarRight: {
    flexDirection: 'row',
    gap: normalize(8),
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(8),
    borderRadius: normalize(8),
  },
  buttonActive: {
    backgroundColor: '#FF3B30',
  },
  buttonDanger: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(8),
    borderRadius: normalize(8),
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: normalize(14),
  },
  debugPanel: {
    maxHeight: normalize(300),
    backgroundColor: '#1a1a1a',
    padding: normalize(12),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  debugTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: normalize(8),
  },
  debugStats: {
    color: '#0f0',
    fontSize: normalize(12),
    marginBottom: normalize(8),
  },
  debugScroll: {
    maxHeight: normalize(200),
  },
  debugLine: {
    color: '#ccc',
    fontSize: normalize(11),
    fontFamily: 'monospace',
    marginBottom: normalize(2),
  },
  debugError: {
    color: '#f44',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: normalize(16),
    fontSize: normalize(16),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: normalize(16),
    width: '90%',
    maxHeight: '80%',
    padding: normalize(20),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: normalize(16),
  },
  modalTitle: {
    fontSize: normalize(20),
    fontWeight: 'bold',
  },
  modalClose: {
    fontSize: normalize(16),
    color: '#007AFF',
  },
  kpjItem: {
    padding: normalize(12),
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  kpjText: {
    fontSize: normalize(14),
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: normalize(32),
  },
});
