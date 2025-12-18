import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
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
import {collection, getDocs, query, updateDoc, where} from 'firebase/firestore';
import {doc, serverTimestamp} from 'firebase/firestore';
import {db} from '../../utils/firebase';
import {loadSession} from '../../utils/session';

const LASIK_URL =
  'https://lapakasik.bpjsketenagakerjaan.go.id/?source=e419a6aed6c50fefd9182774c25450b333de8d5e29169de6018bd1abb1c8f89b';

export default function LasikWebView() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [currentUrl, setCurrentUrl] = useState(LASIK_URL);
  const webRef = useRef<WebView>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [foundUserCount, setFoundUserCount] = useState(0);
  const [pendingStep, setPendingStep] = useState<0 | 1 | 2 | 3 | 7>(0);
  const lastRunUrlRef = useRef<string | null>(null);
  const loopInitializedRef = useRef(false);
  const [items, setItems] = useState<
    Array<{id: string; nik?: string; kpj?: string; name?: string}>
  >([]);
  const indexRef = useRef(0);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      setUserId(session?.userId ?? null);
      setRole(session?.role ?? null);
      setEmail(session?.email ?? null);
    })();
  }, []);

  const isAdmin =
    role === 'admin' || email === 'admin' || userId === 'admin' || email === 'admin@admin';

  useEffect(() => {
    (async () => {
      if (!userId) return;
      try {
        const q = query(collection(db, 'foundUser'), where('userId', '==', userId));
        const snap = await getDocs(q);
        setFoundUserCount(snap.size);
        const mapped = snap.docs.map(d => ({id: d.id, ...(d.data() as any)}));
        // Keep only fields we need for LASIK fill
        setItems(
          mapped.map((x: any) => ({
            id: String(x.id),
            nik: x.nik ? String(x.nik) : undefined,
            kpj: x.kpj ? String(x.kpj) : undefined,
            name: x.name ? String(x.name) : undefined,
          })),
        );
      } catch (e) {
        // ignore: webview can still run even if this fails
      }
    })();
  }, [userId]);

  const normalizeUrl = (url: string) => url.replace(/\/+$/, '');

  const toast = (msg: string) => {
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert('LASIK', msg);
  };

  const injectStep1CloseBanner = () => {
    webRef.current?.injectJavaScript(`
      (function () {
        function post(ok, extra) {
          try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'lasik', step:1, ok:ok}, extra||{}))); } catch (e) {}
        }
        try {
          var btn = document.querySelector('#btn-close-popup-banner');
          if (!btn) {
            post(true, {note:'banner button not found'});
            return true;
          }
          try {
            btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
          } catch (e) {
            try { btn.click(); } catch (e2) {}
          }
          post(true, {clicked:true});
        } catch (e) {
          post(false, {reason:String(e)});
        }
      })();
      true;
    `);
  };

  const injectStep2ClickSwalOk = () => {
    // Wait for SweetAlert2 OK button then click.
    webRef.current?.injectJavaScript(`
      (function () {
        function post(ok, extra) {
          try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'lasik', step:2, ok:ok}, extra||{}))); } catch (e) {}
        }
        function click(el) {
          try {
            el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
            return true;
          } catch (e) {
            try { el.click(); return true; } catch (e2) {}
          }
          return false;
        }
        try {
          var attempts = 0;
          var maxAttempts = 40; // ~20s
          var interval = setInterval(function(){
            attempts++;
            var okBtn = document.querySelector('button.swal2-confirm.swal2-styled');
            if (okBtn) {
              clearInterval(interval);
              click(okBtn);
              post(true, {clicked:true, attempts:attempts});
            } else if (attempts >= maxAttempts) {
              clearInterval(interval);
              post(false, {reason:'OK button not found', attempts:attempts});
            }
          }, 1000);
        } catch (e) {
          post(false, {reason:String(e)});
        }
      })();
      true;
    `);
  };

  const injectStep3to6FillAndNext = (payload: {
    nik: string;
    kpj: string;
    name: string;
  }) => {
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'lasik', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }
        function setVal(input, value) {
          try {
            input.focus();
            input.value = value;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            return true;
          } catch (e) {}
          return false;
        }
        function fireEnter(el) {
          try {
            if (!el) return false;
            el.focus();
            var opts = {bubbles:true, cancelable:true, key:'Enter', code:'Enter', keyCode:13, which:13};
            try { el.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch (e) {}
            try { el.dispatchEvent(new KeyboardEvent('keypress', opts)); } catch (e) {}
            try { el.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch (e) {}
            // Fallback: submit closest form if any
            try {
              var form = el.closest && el.closest('form');
              if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
              else if (form) form.submit();
            } catch (e2) {}
            return true;
          } catch (e3) {}
          return false;
        }
        function findInputByPlaceholder(ph) {
          var inputs = Array.prototype.slice.call(document.querySelectorAll('input.form-control'));
          return inputs.find(function(i){ return String(i.getAttribute('placeholder') || '') === ph; }) || null;
        }
        try {
          var nik = ${JSON.stringify(payload.nik)};
          var kpj = ${JSON.stringify(payload.kpj)};
          var name = ${JSON.stringify(payload.name)};

          var attempts = 0;
          var maxAttempts = 60; // ~30s
          var interval = setInterval(function(){
            attempts++;
            var nikInput = findInputByPlaceholder('Isi Nomor E-KTP');
            var kpjInput = findInputByPlaceholder('Isi Nomor KPJ');
            var nameInput = findInputByPlaceholder('Isi Nama sesuai KTP');

            if (!nikInput || !kpjInput || !nameInput) {
              if (attempts >= maxAttempts) {
                clearInterval(interval);
                post(3, false, {reason:'Form inputs not ready', attempts:attempts});
              }
              return;
            }

            setVal(nikInput, nik);
            post(3, true, {nik: nik});
            setVal(kpjInput, kpj);
            post(4, true, {kpj: kpj});
            setVal(nameInput, name);
            post(5, true, {name: name});

            var ok = fireEnter(nameInput);
            post(6, ok, {enter:true});
            clearInterval(interval);
          }, 1000);
        } catch (e) {
          post(3, false, {reason:String(e)});
        }
      })();
      true;
    `);
  };

  const injectStep7DetectBersedia = () => {
    webRef.current?.injectJavaScript(`
      (function () {
        function post(ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'lasik', step:7, ok:ok}, extra || {})));
          } catch (e) {}
        }
        try {
          var attempts = 0;
          var maxAttempts = 40; // ~20s
          var interval = setInterval(function(){
            attempts++;
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            var bersedia = btns.find(function(b){
              return ((b.textContent || '').trim().toLowerCase() === 'bersedia');
            }) || null;
            if (bersedia) {
              clearInterval(interval);
              post(true, {hasBersedia:true, attempts:attempts});
            } else if (attempts >= maxAttempts) {
              clearInterval(interval);
              post(true, {hasBersedia:false, attempts:attempts});
            }
          }, 1000);
        } catch (e) {
          post(false, {reason:String(e)});
        }
      })();
      true;
    `);
  };

  const startLoopIfReady = () => {
    if (!items.length) {
      toast('No foundUser data to check');
      return;
    }
    const idx = indexRef.current;
    const item = items[idx];
    if (!item) {
      toast('Loop finished');
      return;
    }
    const nik = (item.nik || '').trim();
    const kpj = (item.kpj || '').trim();
    const name = (item.name || '').trim();
    if (!nik || !kpj || !name) {
      // mark as false if incomplete, then continue
      (async () => {
        try {
          await updateDoc(doc(db, 'foundUser', item.id), {
            validasiLasik: 'false',
            lasikCheckedAt: serverTimestamp(),
            lasikReason: 'missing nik/kpj/name',
          } as any);
        } catch {}
        indexRef.current = idx + 1;
        startLoopIfReady();
      })();
      return;
    }
    setPendingStep(3);
    injectStep3to6FillAndNext({nik, kpj, name});
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          LASIK
        </Text>
      </View>

      {isAdmin ? (
        <Text style={styles.url} numberOfLines={1}>
          {currentUrl}{' '}
          {userId
            ? `• ${foundUserCount} data • step:${pendingStep} • idx:${indexRef.current + 1}/${items.length || 0}`
            : ''}
        </Text>
      ) : null}

      <WebView
        ref={webRef}
        source={{uri: LASIK_URL}}
        onNavigationStateChange={nav => {
          if (nav?.url) setCurrentUrl(nav.url);
        }}
        onLoadEnd={e => {
          const url = e?.nativeEvent?.url;
          if (url) setCurrentUrl(url);

          // Auto-run steps after entering LASIK webview (once per URL).
          if (url) {
            const normalized = normalizeUrl(url);
            if (lastRunUrlRef.current !== normalized) {
              lastRunUrlRef.current = normalized;
              setPendingStep(1);
              injectStep1CloseBanner();
            }
          }
        }}
        onMessage={e => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg?.type !== 'lasik') return;
            if (msg.step === 1) {
              // proceed to step 2 regardless (banner might not exist)
              setPendingStep(2);
              injectStep2ClickSwalOk();
            } else if (msg.step === 2) {
              setPendingStep(0);
              toast(msg.ok ? 'LASIK ready' : 'LASIK: OK not found');
              // Start looping after initial dismissals (only once).
              // After step 7 we redirect to LASIK_URL and run step 1+2 again,
              // but we must continue from the current index (do NOT reset to 0).
              if (!loopInitializedRef.current) {
                indexRef.current = 0;
                loopInitializedRef.current = true;
              }
              startLoopIfReady();
            } else if (msg.step === 6) {
              // After clicking Next, check for Bersedia
              setPendingStep(7);
              injectStep7DetectBersedia();
            } else if (msg.step === 7) {
              const idx = indexRef.current;
              const item = items[idx];
              if (!item) {
                setPendingStep(0);
                toast('Loop finished');
                return;
              }

              const hasBersedia = msg?.hasBersedia === true;
              (async () => {
                try {
                  await updateDoc(doc(db, 'foundUser', item.id), {
                    validasiLasik: hasBersedia ? 'true' : 'false',
                    lasikCheckedAt: serverTimestamp(),
                  } as any);
                } catch (e: any) {
                  toast(`Firestore update failed: ${e?.message ?? String(e)}`);
                } finally {
                  // continue to next item; reload page to reset form
                  indexRef.current = idx + 1;
                  if (indexRef.current >= items.length) {
                    setPendingStep(0);
                    toast('Loop finished');
                    return;
                  }
                  // Allow the next cycle to run step 1+2 again on the same URL.
                  lastRunUrlRef.current = null;
                  webRef.current?.injectJavaScript(`
                    (function(){ try { window.location.href = ${JSON.stringify(LASIK_URL)}; } catch(e) {} })();
                    true;
                  `);
                }
              })();
            }
          } catch {
            // ignore
          }
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff', paddingTop: normalize(18)},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: normalize(12),
    paddingTop: normalize(8),
    paddingBottom: normalize(6),
    gap: normalize(10),
  },
  backBtn: {
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(8),
    borderRadius: normalize(10),
    backgroundColor: '#111',
  },
  backText: {color: '#fff', fontWeight: '800'},
  title: {flex: 1, fontWeight: '900', fontSize: normalize(16), color: '#111'},
  url: {
    paddingHorizontal: normalize(12),
    paddingBottom: normalize(8),
    fontSize: normalize(10),
    color: '#666',
  },
  loading: {flex: 1, justifyContent: 'center', alignItems: 'center'},
});

