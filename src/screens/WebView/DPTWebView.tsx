import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import normalize from 'react-native-normalize';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {db} from '../../utils/firebase';
import {loadSession} from '../../utils/session';

const KPU_DPT_URL = 'https://cekdptonline.kpu.go.id/';

export default function DPTWebView() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(KPU_DPT_URL);
  const [webSourceUrl, setWebSourceUrl] = useState(KPU_DPT_URL);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{
      id: string;
      nik?: string;
      kpj?: string;
      name?: string;
      validasiDPT?: boolean;
    }>
  >([]);
  const [pendingStep, setPendingStep] = useState<0 | 1 | 2 | 3>(0);
  const pendingStepRef = useRef<0 | 1 | 2 | 3>(0);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const lastStep1UrlRef = useRef<string | null>(null);
  const lastStep2UrlRef = useRef<string | null>(null);
  const processingLockRef = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      setUserId(session?.userId ?? null);
      setRole(session?.role ?? null);
      if (session?.role === 'admin') {
        setDebugOpen(true);
      }
    })();
  }, []);

  const isAdmin = role === 'admin';

  const pushLog = (line: string) => {
    if (!isAdmin) return;
    setDebugLogs(prev => {
      const next = [`${new Date().toLocaleTimeString()}  ${line}`, ...prev];
      return next.slice(0, 80);
    });
  };

  useEffect(() => {
    (async () => {
      if (!userId) return;
      try {
        // Load foundUser and filter for validasiDPT = false or undefined/null
        // Firestore doesn't support querying for false directly, so we load all and filter
        const q = query(
          collection(db, 'foundUser'),
          where('userId', '==', userId),
        );
        const snap = await getDocs(q);
        const mapped = snap.docs
          .map(d => ({
            id: d.id,
            ...(d.data() as any),
          }))
          .filter((x: any) => {
            // Include items where validasiDPT is false, undefined, or null
            return x.validasiDPT !== true;
          });
        setItems(
          mapped.map((x: any) => ({
            id: String(x.id),
            nik: x.nik ? String(x.nik).replace(/\D+/g, '') : undefined,
            kpj: x.kpj ? String(x.kpj) : undefined,
            name: x.name ? String(x.name) : undefined,
            validasiDPT: x.validasiDPT === true,
          })),
        );
        pushLog(`Loaded ${mapped.length} foundUser with validasiDPT=false (from ${snap.size} total)`);
      } catch (e) {
        pushLog(`load foundUser failed: ${String((e as any)?.message ?? e)}`);
      }
    })();
  }, [userId]);

  const normalizeUrl = (url: string) => url.replace(/\/+$/, '');

  const injectStep1InputNik = (nik: string) => {
    if (processingLockRef.current) {
      pushLog('⚠️ Processing locked, skipping step 1');
      return;
    }
    processingLockRef.current = true;

    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        var nik = ${JSON.stringify(nik)};
        var nikDigits = String(nik || '').replace(/\\D+/g, '');
        if (!nikDigits || nikDigits.length < 12) {
          post(1, false, {reason:'NIK invalid or too short', nik: nik});
          return true;
        }

        // Wait for input id="__BVID__20"
        var attempts = 0;
        var maxAttempts = 60; // 60s
        var interval = setInterval(function(){
          attempts++;
          var input = document.querySelector('input#__BVID__20');
          if (!input) {
            if (attempts >= maxAttempts) {
              clearInterval(interval);
              post(1, false, {reason:'NIK input not found', attempts: attempts});
            }
            return;
          }

          try {
            input.focus();
            input.value = nikDigits;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            post(1, true, {nik: nikDigits, attempts: attempts});
          } catch (e) {
            post(1, false, {reason:String(e), nik: nikDigits});
          }

          clearInterval(interval);
        }, 1000);
      })();
      true;
    `);
    pushLog(`Injected step 1 (input NIK: ${nik})`);
  };

  const injectStep2ClickPencarian = () => {
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        function clickWithEvent(el) {
          try {
            el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
            return true;
          } catch (e) {
            try { el.click(); return true; } catch (e2) {}
          }
          return false;
        }

        // Find button containing "Pencarian"
        var attempts = 0;
        var maxAttempts = 30;
        var interval = setInterval(function(){
          attempts++;
          var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
          var searchBtn = btns.find(function(b){
            return (b.textContent || '').toLowerCase().indexOf('pencarian') !== -1;
          }) || null;
          
          if (searchBtn) {
            clickWithEvent(searchBtn);
            post(2, true, {attempts: attempts});
            clearInterval(interval);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            post(2, false, {reason:'Pencarian button not found', attempts: attempts});
          }
        }, 1000);
      })();
      true;
    `);
    pushLog('Injected step 2 (click Pencarian)');
  };

  const injectStep3ExtractResult = (docId: string, nik: string) => {
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        // Wait for result h2.mb-2 b + optional Kelurahan/Kabupaten
        var attempts = 0;
        var maxAttempts = 60;
        var interval = setInterval(function(){
          attempts++;
          var b = document.querySelector('h2.mb-2 b');
          var name = b ? (b.textContent || '').trim() : '';
          
          if (name) {
            // Try parse kelurahan/kabupaten from the paragraph
            var p = Array.prototype.slice.call(document.querySelectorAll('p'))
              .find(function(x){
                var t = (x.textContent || '').toLowerCase();
                return t.indexOf('anda telah terdaftar') !== -1 && t.indexOf('kelurahan') !== -1;
              }) || null;
            var kelurahan = '';
            var kabupaten = '';
            if (p) {
              var bs = p.querySelectorAll('b');
              if (bs && bs.length >= 1) kelurahan = (bs[0].textContent || '').trim();
              if (bs && bs.length >= 2) kabupaten = (bs[1].textContent || '').trim();
            }
            
            clearInterval(interval);
            post(3, true, {name: name, kelurahan: kelurahan, kabupaten: kabupaten, nik: ${JSON.stringify(nik)}, docId: ${JSON.stringify(docId)}});
          } else {
            // Check for "data anda belum terdaftar" message
            var notRegistered = Array.prototype.slice.call(document.querySelectorAll('*'))
              .find(function(el){
                var txt = (el.textContent || '').toLowerCase();
                return txt.indexOf('data anda belum terdaftar') !== -1;
              });
            
            if (notRegistered) {
              clearInterval(interval);
              post(3, false, {reason:'Data belum terdaftar', nik: ${JSON.stringify(nik)}, docId: ${JSON.stringify(docId)}});
            } else if (attempts >= maxAttempts) {
              clearInterval(interval);
              post(3, false, {reason:'Result not found', nik: ${JSON.stringify(nik)}, docId: ${JSON.stringify(docId)}});
            }
          }
        }, 1000);
      })();
      true;
    `);
    pushLog(`Injected step 3 (extract result for NIK: ${nik})`);
  };

  const onPressProcess = () => {
    pushLog('Process pressed');
    if (!items.length) {
      Alert.alert('Tidak ada data', 'Tidak ada foundUser dengan validasiDPT=false');
      return;
    }

    setCheckedCount(0);
    setFoundCount(0);
    setNotFoundCount(0);
    indexRef.current = 0;
    setIndex(0);
    processingLockRef.current = false;
    pendingStepRef.current = 1;
    setPendingStep(1);
    lastStep1UrlRef.current = null;
    lastStep2UrlRef.current = null;

    const firstItem = items[0];
    if (firstItem?.nik) {
      pushLog(`Starting with item 0: NIK=${firstItem.nik}`);
      injectStep1InputNik(firstItem.nik);
    } else {
      pushLog('First item has no NIK, skipping');
      pendingStepRef.current = 0;
      setPendingStep(0);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarTitle}>Cek DPT</Text>
          <Text style={styles.topBarSubtitle} numberOfLines={1}>
            Progress: {checkedCount}/{items.length || 0} • Found: {foundCount} • Not
            found: {notFoundCount}
          </Text>
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={[styles.processBtn, pendingStep !== 0 && styles.processBtnDisabled]}
            onPress={onPressProcess}
            disabled={pendingStep !== 0}>
            <Text style={styles.processBtnText}>Process</Text>
          </TouchableOpacity>

          {isAdmin ? (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setDebugOpen(v => !v)}>
              <Text style={styles.iconBtnText}>
                {debugOpen ? 'Hide' : 'Debug'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.iconBtn, styles.exitIconBtn]}
            onPress={() => navigation.goBack()}>
            <Text style={[styles.iconBtnText, styles.exitIconBtnText]}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isAdmin && debugOpen ? (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Debug</Text>
          <Text style={styles.debugUrl} numberOfLines={1}>
            URL: {currentUrl}
          </Text>
          <Text style={styles.debugStats} numberOfLines={1}>
            Item: {index + 1}/{items.length || 0} • Found: {foundCount} • Not found:{' '}
            {notFoundCount} • Pending: {pendingStep}
          </Text>
          <ScrollView style={styles.debugScroll}>
            {debugLogs.map((l, idx) => (
              <Text key={String(idx)} style={styles.debugLine}>
                {l}
              </Text>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <WebView
        ref={webRef}
        source={{uri: webSourceUrl}}
        onNavigationStateChange={nav => {
          if (nav?.url) {
            setCurrentUrl(nav.url);
            pushLog(`nav: ${nav.url}`);
          }
        }}
        onLoadEnd={e => {
          const url = e?.nativeEvent?.url;
          if (url) {
            setCurrentUrl(url);
            pushLog(`loadEnd: ${url}`);
          }

          const normalized = normalizeUrl(url || '');

          // Step 1: Input NIK
          if (pendingStepRef.current === 1 && url) {
            if (lastStep1UrlRef.current !== normalized) {
              lastStep1UrlRef.current = normalized;
              const item = items[indexRef.current];
              if (item?.nik) {
                pushLog(`Step 1: Inputting NIK ${item.nik}`);
                injectStep1InputNik(item.nik);
              } else {
                pushLog('Step 1: No NIK, skipping to next');
                const nextIndex = indexRef.current + 1;
                if (nextIndex >= items.length) {
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                  processingLockRef.current = false;
                  pushLog('✅ All items processed - loop finished');
                } else {
                  indexRef.current = nextIndex;
                  setIndex(nextIndex);
                  lastStep1UrlRef.current = null;
                  lastStep2UrlRef.current = null;
                  pushLog(`No NIK at index ${indexRef.current}, continuing to next item ${nextIndex + 1}/${items.length}`);
                  // Navigate to KPU DPT URL for next item
                  const cacheBuster = `?t=${Date.now()}`;
                  setWebSourceUrl(`${KPU_DPT_URL}${cacheBuster}`);
                }
              }
            }
          }

          // Step 2: Click Pencarian
          if (pendingStepRef.current === 2 && url) {
            if (lastStep2UrlRef.current !== normalized) {
              lastStep2UrlRef.current = normalized;
              pushLog('Step 2: Clicking Pencarian');
              injectStep2ClickPencarian();
            }
          }
        }}
        onMessage={e => {
          try {
            pushLog(`msg: ${e.nativeEvent.data}`);
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg?.type === 'process') {
              const step = msg?.step;
              const ok = msg?.ok === true;

              if (step === 1) {
                processingLockRef.current = false;
                if (ok) {
                  pushLog(`Step 1: NIK inputted: ${msg?.nik}`);
                  pendingStepRef.current = 2;
                  setPendingStep(2);
                  lastStep2UrlRef.current = null;
                  // Step 2 will run on next loadEnd
                  setTimeout(() => {
                    injectStep2ClickPencarian();
                  }, 1000);
                } else {
                  pushLog(`Step 1 failed: ${msg?.reason}`);
                  // Skip to next item
                  const nextIndex = indexRef.current + 1;
                  if (nextIndex >= items.length) {
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    processingLockRef.current = false;
                    pushLog('✅ All items processed - loop finished');
                  } else {
                    indexRef.current = nextIndex;
                    setIndex(nextIndex);
                    pendingStepRef.current = 1;
                    setPendingStep(1);
                    lastStep1UrlRef.current = null;
                    lastStep2UrlRef.current = null;
                    const cacheBuster = `?t=${Date.now()}`;
                    setWebSourceUrl(`${KPU_DPT_URL}${cacheBuster}`);
                    pushLog(`Step 1 failed, continuing to next item ${nextIndex + 1}/${items.length}`);
                  }
                }
              } else if (step === 2) {
                if (ok) {
                  pushLog('Step 2: Pencarian clicked');
                  pendingStepRef.current = 3;
                  setPendingStep(3);
                  const item = items[indexRef.current];
                  if (item?.nik && item?.id) {
                    // Step 3 will extract result
                    setTimeout(() => {
                      injectStep3ExtractResult(item.id, item.nik);
                    }, 2000);
                  }
                } else {
                  pushLog(`Step 2 failed: ${msg?.reason}`);
                  // Skip to next item
                  const nextIndex = indexRef.current + 1;
                  if (nextIndex >= items.length) {
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    processingLockRef.current = false;
                    pushLog('✅ All items processed - loop finished');
                  } else {
                    indexRef.current = nextIndex;
                    setIndex(nextIndex);
                    pendingStepRef.current = 1;
                    setPendingStep(1);
                    lastStep1UrlRef.current = null;
                    lastStep2UrlRef.current = null;
                    const cacheBuster = `?t=${Date.now()}`;
                    setWebSourceUrl(`${KPU_DPT_URL}${cacheBuster}`);
                    pushLog(`Step 2 failed, continuing to next item ${nextIndex + 1}/${items.length}`);
                  }
                }
              } else if (step === 3) {
                processingLockRef.current = false;
                const item = items[indexRef.current];
                const docId = msg?.docId || item?.id;
                const nik = msg?.nik || item?.nik;

                if (ok && msg?.name) {
                  // Found in DPT - update Firestore
                  const kpuName = String(msg.name);
                  (async () => {
                    try {
                      if (docId) {
                        await updateDoc(doc(db, 'foundUser', docId), {
                          name: kpuName,
                          nameSource: 'kpu',
                          kelurahan: String(msg?.kelurahan ?? ''),
                          kabupaten: String(msg?.kabupaten ?? ''),
                          validasiDPT: true,
                          updatedAt: serverTimestamp(),
                        });
                        pushLog(`✅ Updated foundUser: ${docId} (validasiDPT=true)`);
                        setFoundCount(c => c + 1);
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('Data Berhasil Disimpan', ToastAndroid.SHORT);
                        }
                      }
                    } catch (err: any) {
                      pushLog(`Update error: ${err?.message ?? String(err)}`);
                    } finally {
                      setCheckedCount(c => c + 1);
                      // Continue to next item
                      const nextIndex = indexRef.current + 1;
                      pushLog(`Step 3 done: checked ${nextIndex}/${items.length}`);
                      if (nextIndex >= items.length) {
                        pendingStepRef.current = 0;
                        setPendingStep(0);
                        processingLockRef.current = false;
                        pushLog('✅ All items processed - loop finished');
                      } else {
                        indexRef.current = nextIndex;
                        setIndex(nextIndex);
                        pendingStepRef.current = 1;
                        setPendingStep(1);
                        lastStep1UrlRef.current = null;
                        lastStep2UrlRef.current = null;
                        // Navigate back to KPU DPT URL to start next item
                        const cacheBuster = `?t=${Date.now()}`;
                        setWebSourceUrl(`${KPU_DPT_URL}${cacheBuster}`);
                        pushLog(`Continuing to next item ${nextIndex + 1}/${items.length}: NIK=${items[nextIndex]?.nik ?? 'N/A'}`);
                      }
                    }
                  })();
                } else {
                  // Not found or error - delete foundUser from Firestore
                  pushLog(`Step 3: ${msg?.reason ?? 'Not found'} - deleting foundUser`);
                  const item = items[indexRef.current];
                  const docId = msg?.docId || item?.id;
                  
                  (async () => {
                    try {
                      if (docId) {
                        await deleteDoc(doc(db, 'foundUser', docId));
                        pushLog(`✅ Deleted foundUser: ${docId} (not found in DPT)`);
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('Data Dihapus (Tidak Ditemukan)', ToastAndroid.SHORT);
                        }
                      }
                    } catch (err: any) {
                      pushLog(`Delete error: ${err?.message ?? String(err)}`);
                    } finally {
                      setNotFoundCount(c => c + 1);
                      setCheckedCount(c => c + 1);
                      
                      // Continue to next item
                      const nextIndex = indexRef.current + 1;
                      pushLog(`Step 3 done (not found): checked ${nextIndex}/${items.length}`);
                      if (nextIndex >= items.length) {
                        pendingStepRef.current = 0;
                        setPendingStep(0);
                        processingLockRef.current = false;
                        pushLog('✅ All items processed - loop finished');
                      } else {
                        indexRef.current = nextIndex;
                        setIndex(nextIndex);
                        pendingStepRef.current = 1;
                        setPendingStep(1);
                        lastStep1UrlRef.current = null;
                        lastStep2UrlRef.current = null;
                        // Navigate back to KPU DPT URL to start next item
                        const cacheBuster = `?t=${Date.now()}`;
                        setWebSourceUrl(`${KPU_DPT_URL}${cacheBuster}`);
                        pushLog(`Continuing to next item ${nextIndex + 1}/${items.length}: NIK=${items[nextIndex]?.nik ?? 'N/A'}`);
                      }
                    }
                  })();
                }
              }
            }
          } catch {
            // ignore non-JSON messages
          }
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: normalize(30),
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  topBarLeft: {
    flex: 1,
    paddingRight: normalize(10),
  },
  topBarTitle: {
    fontSize: normalize(14),
    fontWeight: '900',
    color: '#111',
  },
  topBarSubtitle: {
    marginTop: normalize(2),
    fontSize: normalize(10),
    color: '#777',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: normalize(8),
  },
  processBtn: {
    height: normalize(36),
    paddingHorizontal: normalize(14),
    borderRadius: normalize(10),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processBtnDisabled: {opacity: 0.45},
  processBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(13),
  },
  iconBtn: {
    height: normalize(36),
    paddingHorizontal: normalize(10),
    borderRadius: normalize(10),
    backgroundColor: '#f2f3f7',
    borderWidth: 1,
    borderColor: '#e6e8ef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    color: '#111',
    fontWeight: '800',
    fontSize: normalize(12),
  },
  exitIconBtn: {
    backgroundColor: '#fff0ef',
    borderColor: '#ffd1cf',
  },
  exitIconBtnText: {
    color: '#ff3b30',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  debugPanel: {
    backgroundColor: '#1a1a1a',
    padding: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    maxHeight: normalize(300),
  },
  debugTitle: {
    color: '#0f0',
    fontWeight: '800',
    fontSize: normalize(12),
    marginBottom: normalize(4),
  },
  debugUrl: {
    color: '#0ff',
    fontSize: normalize(10),
    marginBottom: normalize(2),
  },
  debugStats: {
    color: '#ff0',
    fontSize: normalize(10),
    marginBottom: normalize(4),
  },
  debugScroll: {
    maxHeight: normalize(200),
  },
  debugLine: {
    color: '#0f0',
    fontSize: normalize(9),
    fontFamily: 'monospace',
    marginBottom: normalize(2),
  },
});
