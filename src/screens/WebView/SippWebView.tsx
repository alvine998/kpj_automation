import React, {useEffect, useRef, useState} from 'react';
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
import {WebView} from 'react-native-webview';
import normalize from 'react-native-normalize';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../App';
import {loadGeneratedKpj} from '../../utils/kpjStorage';

export default function SippWebView() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webRef = useRef<WebView>(null);
  const [listOpen, setListOpen] = useState(false);
  const [kpjList, setKpjList] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>(
    'https://sipp.bpjsketenagakerjaan.go.id/',
  );
  const [debugOpen, setDebugOpen] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [pendingStep, setPendingStep] = useState<0 | 2 | 4 | 5>(0);
  const pendingStepRef = useRef<0 | 2 | 4 | 5>(0);
  const lastStep2UrlRef = useRef<string | null>(null);
  const lastStep4UrlRef = useRef<string | null>(null);
  const lastStep5UrlRef = useRef<string | null>(null);
  const kpjIndexRef = useRef<number>(0);
  const [kpjIndex, setKpjIndex] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);

  useEffect(() => {
    (async () => {
      const data = await loadGeneratedKpj();
      setKpjList(data?.generated ?? []);
    })();
  }, []);

  const pushLog = (line: string) => {
    setDebugLogs(prev => {
      const next = [`${new Date().toLocaleTimeString()}  ${line}`, ...prev];
      return next.slice(0, 80);
    });
  };

  const injectStep2And3 = () => {
    // Step 2: click SweetAlert2 OK
    // Step 3: click modal close X
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

        var okSel = 'button.swal2-confirm, .swal2-container button.swal2-confirm, button.swal2-confirm.swal2-styled';
        var closeSel = 'button.close[data-dismiss="modal"]';

        // wait for OK, click it, then wait for close and click it
        var attempts = 0;
        var maxAttempts = 60; // ~15s
        var okInterval = setInterval(function(){
          attempts++;
          var okBtn = document.querySelector(okSel);
          if (okBtn) {
            clickWithEvent(okBtn);
            clearInterval(okInterval);
            post(2, true, {label:'OK button', attempts: attempts});

            // now close
            var closeAttempts = 0;
            var closeMax = 60;
            var closeInterval = setInterval(function(){
              closeAttempts++;
              var closeBtn = document.querySelector(closeSel);
              if (closeBtn) {
                clickWithEvent(closeBtn);
                clearInterval(closeInterval);
                post(3, true, {label:'Close (×) button', attempts: closeAttempts});
              } else if (closeAttempts >= closeMax) {
                clearInterval(closeInterval);
                post(3, false, {reason:'Close (×) button not found', attempts: closeAttempts});
              }
            }, 250);
          } else if (attempts >= maxAttempts) {
            clearInterval(okInterval);
            post(2, false, {reason:'OK button not found', attempts: attempts});
          }
        }, 250);
      })();
      true;
    `);
    pushLog('Injected step 2+3');
  };

  const injectStep4TambahTk = () => {
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

        var href = '/tenaga-kerja/baru/form-tambah-tk-individu';
        var attempts = 0;
        var maxAttempts = 60; // ~15s
        var interval = setInterval(function(){
          attempts++;
          var el = document.querySelector('a[href=\"' + href + '\"]');
          if (!el) {
            // fallback: find by text
            var links = Array.prototype.slice.call(document.querySelectorAll('a'));
            el = links.find(function(a){
              return ((a.textContent || '').trim().toLowerCase() === 'tambah tk');
            }) || null;
          }

          if (el) {
            clickWithEvent(el);
            clearInterval(interval);
            post(4, true, {label:'Tambah TK', attempts: attempts});
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            post(4, false, {reason:'Tambah TK link not found', attempts: attempts});
          }
        }, 250);
      })();
      true;
    `);
    pushLog('Injected step 4 (Tambah TK)');
  };

  const injectSteps5to8ForKpj = (kpj: string) => {
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

        var kpj = ${JSON.stringify(kpj)};

        // Step 5: click "Sudah"
        (function clickSudah(){
          var sudah = document.querySelector('button[href="#collapseTwo"]');
          if (!sudah) {
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            sudah = btns.find(function(b){
              return ((b.textContent || '').trim().toLowerCase() === 'sudah') &&
                (b.getAttribute('href') || '').indexOf('#collapseTwo') !== -1;
            }) || null;
          }
          if (sudah) {
            clickWithEvent(sudah);
            post(5, true, {label:'Sudah'});
          } else {
            post(5, false, {reason:'Sudah button not found'});
          }
        })();

        // Wait for input #kpj then fill + click Lanjut
        var attempts = 0;
        var maxAttempts = 80; // ~20s
        var interval = setInterval(function(){
          attempts++;
          var input = document.querySelector('input#kpj');
          if (!input) {
            if (attempts >= maxAttempts) {
              clearInterval(interval);
              post(6, false, {reason:'KPJ input (#kpj) not found', kpj: kpj});
            }
            return;
          }

          try {
            input.focus();
            input.value = kpj;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            post(6, true, {kpj: kpj});
          } catch (e) {
            post(6, false, {reason:String(e), kpj: kpj});
          }

          var lanjut = Array.prototype.slice.call(document.querySelectorAll('button'))
            .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'lanjut'); }) || null;
          if (!lanjut) {
            lanjut = document.querySelector('button.btn.btn-primary.btn-bordered.waves-effect.w-md');
          }
          if (lanjut) {
            clickWithEvent(lanjut);
            post(7, true, {kpj: kpj});
          } else {
            post(7, false, {reason:'Lanjut button not found', kpj: kpj});
          }

          clearInterval(interval);

          // Step 8: wait for swal2-content and decide
          var sAttempts = 0;
          var sMax = 80; // ~20s
          var sInterval = setInterval(function(){
            sAttempts++;
            var contentEl = document.querySelector('.swal2-content');
            if (!contentEl) {
              if (sAttempts >= sMax) {
                clearInterval(sInterval);
                post(8, false, {reason:'swal2-content not found', kpj: kpj});
              }
              return;
            }

            var txt = (contentEl.textContent || '');
            var low = txt.toLowerCase();
            var registered = low.indexOf('terdaftar sebagai peserta bpjs ketenagakerjaan') !== -1;

            if (registered) {
              var lanjutkan = Array.prototype.slice.call(document.querySelectorAll('button'))
                .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'lanjutkan'); }) || null;
              if (!lanjutkan) {
                lanjutkan = document.querySelector('button.swal2-confirm.btn.btn-success');
              }
              if (lanjutkan) {
                clickWithEvent(lanjutkan);
                post(8, true, {kpj: kpj, found:true, text: txt});
              } else {
                post(8, false, {reason:'Lanjutkan button not found', kpj: kpj});
              }
            } else {
              var okBtn = Array.prototype.slice.call(document.querySelectorAll('button'))
                .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'ok'); }) || null;
              if (!okBtn) {
                okBtn = document.querySelector('button.swal2-confirm');
              }
              if (okBtn) {
                clickWithEvent(okBtn);
                post(8, true, {kpj: kpj, found:false, text: txt});
              } else {
                post(8, false, {reason:'OK button not found', kpj: kpj});
              }
            }

            clearInterval(sInterval);
          }, 250);
        }, 250);
      })();
      true;
    `);
    pushLog(`Injected steps 5-8 for KPJ ${kpj}`);
  };

  const onPressProcess = () => {
    // Process steps:
    // 1) Click "Edit" link (onclick="view('...')")
    // 2) Click SweetAlert2 OK button: button.swal2-confirm.swal2-styled
    // 3) Click modal close button: button.close[data-dismiss="modal"]
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        function clickEdit() {
          var links = Array.prototype.slice.call(document.querySelectorAll('a'));
          var target = links.find(function(a){
            var txt = (a.textContent || '').trim().toLowerCase();
            var oc = (a.getAttribute('onclick') || '');
            return txt === 'edit' && /view\\('\\s*[^']+\\s*'\\)/.test(oc);
          });
          if (!target) {
            target = links.find(function(a){
              var oc = (a.getAttribute('onclick') || '');
              return /view\\('\\s*[^']+\\s*'\\)/.test(oc);
            });
          }
          if (!target) return {ok:false, reason:'Edit link not found'};

          var oc = (target.getAttribute('onclick') || '');
          var m = oc.match(/view\\('\\s*([^']+)\\s*'\\)/);
          var id = m && m[1] ? m[1] : null;

          if (id && typeof window.view === 'function') {
            window.view(id);
          } else if (typeof target.onclick === 'function') {
            target.onclick();
          } else {
            target.click();
          }
          return {ok:true, id:id};
        }

        try {
          var r = clickEdit();
          if (!r.ok) {
            post(1, false, {reason: r.reason});
            return true;
          }
          post(1, true, {id: r.id});
        } catch (e) {
          post(1, false, {reason: String(e)});
        }
      })();
      true;
    `);

    pushLog('Process pressed');
    // reset counters for a fresh run
    setFoundCount(0);
    setNotFoundCount(0);
  };

  const normalizeUrl = (url: string) => url.replace(/\/+$/, '');
  const isRootUrl =
    normalizeUrl(currentUrl) === 'https://sipp.bpjsketenagakerjaan.go.id';

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, isRootUrl && styles.actionBtnDisabled]}
          onPress={onPressProcess}
          disabled={isRootUrl}>
          <Text style={styles.actionText}>Process</Text>
        </TouchableOpacity>
        <View style={styles.actionsRight}>
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => setListOpen(true)}>
            <Text style={styles.actionTextOutline}>List KPJ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.debugBtn}
            onPress={() => setDebugOpen(v => !v)}>
            <Text style={styles.debugText}>{debugOpen ? 'Hide' : 'Debug'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={() => navigation.goBack()}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {debugOpen ? (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Debug</Text>
          <Text style={styles.debugUrl} numberOfLines={1}>
            URL: {currentUrl}
          </Text>
          <Text style={styles.debugStats} numberOfLines={1}>
            KPJ: {kpjIndex + 1}/{kpjList.length || 0} • Found: {foundCount} • Not
            found: {notFoundCount} • Pending: {pendingStep}
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
        source={{uri: 'https://sipp.bpjsketenagakerjaan.go.id/'}}
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

          // If step 1 already ran and navigation happened, run step 2+3 on the new page.
          if (pendingStepRef.current === 2 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep2UrlRef.current !== normalized) {
              lastStep2UrlRef.current = normalized;
              injectStep2And3();
            }
          }

          // If step 4 pending, run it on the new page (or after navigation).
          if (pendingStepRef.current === 4 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep4UrlRef.current !== normalized) {
              lastStep4UrlRef.current = normalized;
              injectStep4TambahTk();
            }
          }

          // If step 5 pending, run it on the new page (or after navigation).
          if (pendingStepRef.current === 5 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep5UrlRef.current !== normalized) {
              lastStep5UrlRef.current = normalized;
              const kpj = kpjList[kpjIndexRef.current];
              if (kpj) injectSteps5to8ForKpj(kpj);
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
              let text = 'Process';

              if (step === 1) {
                text = ok
                  ? msg?.id
                    ? `Clicked Edit (${msg.id})`
                    : 'Clicked Edit'
                  : msg?.reason ?? 'Edit link not found';
                if (ok) {
                  // mark pending steps for next page load (navigation may replace JS context)
                  pendingStepRef.current = 2;
                  setPendingStep(2);
                  lastStep2UrlRef.current = null;
                  lastStep4UrlRef.current = null;
                  pushLog('Pending step 2+3');
                }
              } else if (step === 2) {
                text = ok ? 'Clicked OK' : msg?.reason ?? 'OK button not found';
                // If OK wasn't found, keep pending to retry on next load / manual refresh.
                if (ok) {
                  // keep pending until step 3 completes
                  pendingStepRef.current = 2;
                  setPendingStep(2);
                }
              } else if (step === 3) {
                text = ok
                  ? 'Closed modal (×)'
                  : msg?.reason ?? 'Close (×) button not found';
                // After step 3, proceed to step 4.
                if (ok) {
                  pendingStepRef.current = 4;
                  setPendingStep(4);
                  lastStep4UrlRef.current = null;
                  pushLog('Pending step 4 (Tambah TK)');
                  // Try immediately on the current page too (in case no navigation happens)
                  injectStep4TambahTk();
                } else {
                  // stop auto-running unless user presses Process again.
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                  lastStep2UrlRef.current = null;
                  lastStep4UrlRef.current = null;
                }
              } else if (step === 4) {
                text = ok ? 'Clicked Tambah TK' : msg?.reason ?? 'Tambah TK not found';
                if (ok) {
                  if (!kpjList.length) {
                    text = 'KPJ list empty (Beranda → Generate → Cari Data)';
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                  } else {
                    pendingStepRef.current = 5;
                    setPendingStep(5);
                    kpjIndexRef.current = 0;
                    setKpjIndex(0);
                    lastStep5UrlRef.current = null;
                    pushLog('Pending step 5 (loop KPJ)');
                    injectSteps5to8ForKpj(kpjList[0]);
                  }
                } else {
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                }
                lastStep2UrlRef.current = null;
                lastStep4UrlRef.current = null;
                lastStep5UrlRef.current = null;
              } else if (step === 5) {
                text = ok ? 'Clicked Sudah' : msg?.reason ?? 'Sudah not found';
              } else if (step === 6) {
                text = ok
                  ? `Input KPJ: ${msg?.kpj ?? ''}`
                  : msg?.reason ?? 'KPJ input failed';
              } else if (step === 7) {
                text = ok ? 'Clicked Lanjut' : msg?.reason ?? 'Lanjut not found';
              } else if (step === 8) {
                if (ok && msg?.found === true) {
                  text = `FOUND registered: ${msg?.kpj ?? ''}`;
                  setFoundCount(c => c + 1);
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                  lastStep5UrlRef.current = null;
                  pushLog('Loop done (found registered)');
                } else if (ok && msg?.found === false) {
                  const nextIndex = kpjIndexRef.current + 1;
                  setNotFoundCount(c => c + 1);
                  if (nextIndex >= kpjList.length) {
                    text = `No registered found (checked ${kpjList.length})`;
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    lastStep5UrlRef.current = null;
                  } else {
                    text = `Not registered: ${msg?.kpj ?? ''} → next`;
                    kpjIndexRef.current = nextIndex;
                    setKpjIndex(nextIndex);
                    pendingStepRef.current = 5;
                    setPendingStep(5);
                    lastStep5UrlRef.current = null;
                    injectSteps5to8ForKpj(kpjList[nextIndex]);
                  }
                } else {
                  text = msg?.reason ?? 'Step 8 failed';
                }
              }

              if (Platform.OS === 'android') {
                ToastAndroid.show(text, ToastAndroid.SHORT);
              } else {
                Alert.alert('Process', text);
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

      <Modal
        visible={listOpen}
        animationType="slide"
        onRequestClose={() => setListOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Saved KPJ List</Text>
            <TouchableOpacity onPress={() => setListOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={kpjList}
            keyExtractor={item => item}
            contentContainerStyle={styles.modalListContent}
            renderItem={({item, index}) => (
              <View style={styles.row}>
                <Text style={styles.rowIndex}>{index + 1}.</Text>
                <Text style={styles.rowValue}>{item}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No KPJ saved yet. Go to Beranda → Generate → Cari Data.
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff', paddingTop: normalize(30)},
  actions: {
    flexDirection: 'row',
    gap: normalize(10),
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  actionsRight: {
    flex: 1,
    flexDirection: 'row',
    gap: normalize(10),
  },
  actionBtn: {
    flex: 1,
    height: normalize(42),
    borderRadius: normalize(10),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: normalize(14),
  },
  actionBtnOutline: {
    flex: 1,
    height: normalize(42),
    borderRadius: normalize(10),
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextOutline: {
    color: '#007AFF',
    fontWeight: '700',
    fontSize: normalize(14),
  },
  debugBtn: {
    width: normalize(78),
    height: normalize(42),
    borderRadius: normalize(10),
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(14),
  },
  exitBtn: {
    width: normalize(78),
    height: normalize(42),
    borderRadius: normalize(10),
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: normalize(14),
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  debugPanel: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#0b0b0b',
    paddingHorizontal: normalize(12),
    paddingTop: normalize(10),
    paddingBottom: normalize(8),
    maxHeight: normalize(160),
  },
  debugTitle: {
    color: '#fff',
    fontWeight: '800',
    marginBottom: normalize(6),
  },
  debugUrl: {
    color: '#c9c9c9',
    fontSize: normalize(11),
    marginBottom: normalize(6),
  },
  debugStats: {
    color: '#d8d8d8',
    fontSize: normalize(11),
    marginBottom: normalize(6),
  },
  debugScroll: {
    flexGrow: 0,
  },
  debugLine: {
    color: '#9efca3',
    fontSize: normalize(10),
    marginBottom: normalize(3),
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: normalize(14),
  },
  modalHeader: {
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: normalize(16),
    fontWeight: '800',
    color: '#111',
  },
  closeText: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: '#007AFF',
  },
  modalListContent: {
    paddingHorizontal: normalize(16),
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


