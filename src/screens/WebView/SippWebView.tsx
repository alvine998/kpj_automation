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
import {loadSession} from '../../utils/session';
import {addDoc, collection, doc, serverTimestamp, updateDoc} from 'firebase/firestore';
import {db} from '../../utils/firebase';

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
  const [pendingStep, setPendingStep] = useState<0 | 2 | 4 | 5 | 9 | 10 | 11>(0);
  const pendingStepRef = useRef<0 | 2 | 4 | 5 | 9 | 10 | 11>(0);
  const lastStep2UrlRef = useRef<string | null>(null);
  const lastStep4UrlRef = useRef<string | null>(null);
  const lastStep5UrlRef = useRef<string | null>(null);
  const lastStep9UrlRef = useRef<string | null>(null);
  const lastStep10UrlRef = useRef<string | null>(null);
  const lastStep11UrlRef = useRef<string | null>(null);
  const kpjIndexRef = useRef<number>(0);
  const [kpjIndex, setKpjIndex] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const foundKpjRef = useRef<string | null>(null);
  const foundUserDocIdRef = useRef<string | null>(null);
  const foundNikRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await loadGeneratedKpj();
      setKpjList(data?.generated ?? []);
    })();
  }, []);

  const openKpjList = async () => {
    try {
      const data = await loadGeneratedKpj();
      setKpjList(data?.generated ?? []);
    } finally {
      setListOpen(true);
    }
  };

  const refreshKpjList = async () => {
    const data = await loadGeneratedKpj();
    setKpjList(data?.generated ?? []);
    pushLog(`KPJ list refreshed (${(data?.generated ?? []).length})`);
  };

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      setUserId(s?.userId ?? null);
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
            }, 1000);
          } else if (attempts >= maxAttempts) {
            clearInterval(okInterval);
            post(2, false, {reason:'OK button not found', attempts: attempts});
          }
        }, 1000);
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
          var el = document.querySelector('a[href="' + href + '"]');
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
        }, 1000);
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
          }, 1000);
        }, 1000);
      })();
      true;
    `);
    pushLog(`Injected steps 5-8 for KPJ ${kpj}`);
  };

  const injectStep9ExtractProfile = () => {
    // Extract values from the profile form (readonly fields) after "Lanjutkan"
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        function getVal(el) {
          if (!el) return '';
          var v = '';
          try { v = (el.value || '').trim(); } catch (e) {}
          if (v) return v;
          try { v = (el.getAttribute('value') || '').trim(); } catch (e2) {}
          if (v) return v;
          try { v = (el.textContent || '').trim(); } catch (e3) {}
          return v || '';
        }

        function firstVal(selectors) {
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            var v = getVal(el);
            if (v) return v;
          }
          return '';
        }

        function selectedText(selectors) {
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (!el) continue;
            try {
              var opt = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
              var t = opt ? (opt.text || '').trim() : '';
              if (t) return t;
            } catch (e) {}
          }
          return '';
        }

        function extract() {
          var payload = {
            kpj: firstVal(['#kpj','input[name="kpj"]']),
            nik: firstVal(['#no_identitas','input[name="no_identitas"]','#nik','input[name="nik"]']),
            birthdate: firstVal(['#tgl_lahir','input[name="tgl_lahir"]','#birthdate','input[name="birthdate"]']),
            gender: firstVal(['#jenis_kelamin','input[name="jenis_kelamin"]','#gender','input[name="gender"]']),
            marritalStatus: selectedText(['#status_kawin','select[name="status_kawin"]']),
            address: firstVal(['#alamat','input[name="alamat"]','#address','input[name="address"]']),
            phone: firstVal(['#no_handphone','input[name="no_handphone"]','#phone','input[name="phone"]']),
            npwp: firstVal(['#npwp','input[name="npwp"]']),
            email: firstVal(['#email','input[name="email"]']),
            name: firstVal(['#nama_lengkap','input[name="nama_lengkap"]']),
          };
          return payload;
        }

        // Wait until key fields appear (NIK or Birthdate) to avoid extracting too early
        var attempts = 0;
        var maxAttempts = 30; // 30s (1s interval)
        var interval = setInterval(function(){
          attempts++;
          var payload = extract();
          var hasProfile = (payload.nik && payload.nik.length >= 8) || (payload.birthdate && payload.birthdate.length >= 4);
          if (hasProfile) {
            clearInterval(interval);
            post(9, true, Object.assign(payload, {attempts: attempts, url: location.href}));
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            post(9, false, {reason:'Profile fields not ready (nik/birthdate empty)', attempts: attempts, url: location.href, sample: payload});
          }
        }, 1000);
      })();
      true;
    `);
    pushLog('Injected step 9 (extract profile)');
  };

  const injectStep10NavigateBack = () => {
    const target = 'https://sipp.bpjsketenagakerjaan.go.id/tenaga-kerja/baru/form-tambah-tk-individu#';
    webRef.current?.injectJavaScript(`
      (function () {
        try {
          window.location.href = ${JSON.stringify(target)};
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'process', step:11, ok:true, url:${JSON.stringify(target)}}));
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'process', step:11, ok:false, reason:String(e)}));
        }
      })();
      true;
    `);
    pushLog('Injected step 11 (navigate back to form)');
  };

  const injectStep10KpuCheck = (nik: string) => {
    // Navigate to KPU DPT online, fill NIK, click Pencarian, extract name from h2 b.
    // Then send it back to RN to update Firestore.
    webRef.current?.injectJavaScript(`
      (function () {
        function post(step, ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {})));
          } catch (e) {}
        }

        var target = 'https://cekdptonline.kpu.go.id/';
        var nik = ${JSON.stringify(nik)};

        function clickWithEvent(el) {
          try {
            el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
            return true;
          } catch (e) {
            try { el.click(); return true; } catch (e2) {}
          }
          return false;
        }

        try {
          if (location.href.indexOf('cekdptonline.kpu.go.id') === -1) {
            location.href = target;
            post(10, true, {phase:'navigate', url: target});
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
                post(10, false, {phase:'input', reason:'NIK input not found', attempts: attempts});
              }
              return;
            }

            try {
              input.focus();
              input.value = nik;
              input.dispatchEvent(new Event('input', {bubbles:true}));
              input.dispatchEvent(new Event('change', {bubbles:true}));
            } catch (e) {}

            // Find button containing "Pencarian"
            var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
            var searchBtn = btns.find(function(b){
              return (b.textContent || '').toLowerCase().indexOf('pencarian') !== -1;
            }) || null;
            if (searchBtn) {
              clickWithEvent(searchBtn);
              post(10, true, {phase:'search', attempts: attempts});
            } else {
              post(10, false, {phase:'search', reason:'Pencarian button not found'});
            }

            clearInterval(interval);

            // Wait for result h2.mb-2 b
            var rAttempts = 0;
            var rMax = 60;
            var rInt = setInterval(function(){
              rAttempts++;
              var b = document.querySelector('h2.mb-2 b');
              var name = b ? (b.textContent || '').trim() : '';
              if (name) {
                clearInterval(rInt);
                post(10, true, {phase:'result', nik: nik, name: name});
              } else if (rAttempts >= rMax) {
                clearInterval(rInt);
                post(10, false, {phase:'result', reason:'Name result not found', nik: nik});
              }
            }, 1000);
          }, 1000);
        } catch (e) {
          post(10, false, {phase:'error', reason:String(e)});
        }
      })();
      true;
    `);
    pushLog(`Injected step 10 (KPU check) for NIK ${nik}`);
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
            onPress={openKpjList}>
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

          // If step 9 pending, extract profile on the new page.
          if (pendingStepRef.current === 9 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep9UrlRef.current !== normalized) {
              lastStep9UrlRef.current = normalized;
              injectStep9ExtractProfile();
            }
          }

          // If step 10 pending, ensure we do the KPU lookup on the new page
          if (pendingStepRef.current === 10 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep10UrlRef.current !== normalized) {
              lastStep10UrlRef.current = normalized;
              const nik = foundNikRef.current;
              if (nik) {
                injectStep10KpuCheck(nik);
              }
            }
          }

          // If step 11 pending, ensure we navigate back (in case previous injection was cancelled by navigation)
          if (pendingStepRef.current === 11 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep11UrlRef.current !== normalized) {
              lastStep11UrlRef.current = normalized;
              injectStep10NavigateBack();
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
                  const kpj = String(msg?.kpj ?? '');
                  text = `FOUND registered: ${kpj}`;
                  setFoundCount(c => c + 1);
                  foundKpjRef.current = kpj || null;
                  // Next page will load after clicking "Lanjutkan" → extract & save
                  pendingStepRef.current = 9;
                  setPendingStep(9);
                  lastStep9UrlRef.current = null;
                  pushLog('Pending step 9 (extract + save to Firestore)');
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
              } else if (step === 9) {
                if (ok) {
                  text = `Step 9 extracted: ${msg?.kpj ?? ''}`;
                  // Save to Firestore
                  (async () => {
                    try {
                      if (!userId) {
                        throw new Error('No userId in session');
                      }
                      // Guard: don't save empty profile rows
                      const nik = String(msg?.nik ?? '');
                      const birthdate = String(msg?.birthdate ?? '');
                      if (!nik && !birthdate) {
                        throw new Error('Extracted empty profile (nik/birthdate empty)');
                      }
                      const ref = await addDoc(collection(db, 'foundUser'), {
                        userId,
                        kpj: String(msg?.kpj ?? ''),
                        nik: String(msg?.nik ?? ''),
                        birthdate: String(msg?.birthdate ?? ''),
                        gender: String(msg?.gender ?? ''),
                        marritalStatus: String(msg?.marritalStatus ?? ''),
                        address: String(msg?.address ?? ''),
                        phone: String(msg?.phone ?? ''),
                        npwp: String(msg?.npwp ?? ''),
                        email: String(msg?.email ?? ''),
                        name: String(msg?.name ?? ''),
                        createdAt: serverTimestamp(),
                        sourceUrl: currentUrl,
                      });
                      foundUserDocIdRef.current = ref.id;
                      foundNikRef.current = nik || null;
                      pushLog(`Saved to Firestore foundUser: ${String(msg?.kpj ?? '')}`);
                    } catch (err: any) {
                      pushLog(`Firestore save error: ${err?.message ?? String(err)}`);
                    } finally {
                      // Step 10: navigate to KPU + lookup name by NIK
                      pendingStepRef.current = 10;
                      setPendingStep(10);
                      lastStep10UrlRef.current = null;
                      const nik = foundNikRef.current;
                      if (nik) {
                        injectStep10KpuCheck(nik);
                      } else {
                        // If no NIK, skip to step 11
                        pendingStepRef.current = 11;
                        setPendingStep(11);
                        lastStep11UrlRef.current = null;
                        injectStep10NavigateBack();
                      }
                    }
                  })();
                } else {
                  text = msg?.reason ?? 'Step 9 failed';
                  pushLog(`Step 9 failed: ${msg?.reason ?? ''}`);
                  // still attempt to go to step 11 and continue
                  pendingStepRef.current = 11;
                  setPendingStep(11);
                  lastStep11UrlRef.current = null;
                  injectStep10NavigateBack();
                }
              } else if (step === 10) {
                // Step 10: KPU check result
                if (ok && msg?.phase === 'result' && msg?.name) {
                  text = `KPU name: ${String(msg.name)}`;
                  (async () => {
                    try {
                      const docId = foundUserDocIdRef.current;
                      if (docId) {
                        await updateDoc(doc(db, 'foundUser', docId), {
                          name: String(msg.name),
                          nameSource: 'kpu',
                          updatedAt: serverTimestamp(),
                        });
                        pushLog(`Updated foundUser name from KPU: ${String(msg.name)}`);
                      } else {
                        pushLog('No foundUser docId to update');
                      }
                    } catch (err: any) {
                      pushLog(`KPU updateDoc error: ${err?.message ?? String(err)}`);
                    } finally {
                      pendingStepRef.current = 11;
                      setPendingStep(11);
                      lastStep11UrlRef.current = null;
                      injectStep10NavigateBack();
                    }
                  })();
                } else if (!ok && msg?.phase === 'result') {
                  text = msg?.reason ?? 'KPU result not found';
                  // still go back to SIPP
                  pendingStepRef.current = 11;
                  setPendingStep(11);
                  lastStep11UrlRef.current = null;
                  injectStep10NavigateBack();
                } else {
                  text = ok ? `KPU: ${msg?.phase ?? 'ok'}` : msg?.reason ?? 'Step 10 failed';
                }
              } else if (step === 11) {
                text = ok ? 'Back to form' : msg?.reason ?? 'Step 11 failed';
                // Continue loop from next KPJ until end
                const nextIndex = kpjIndexRef.current + 1;
                if (nextIndex >= kpjList.length) {
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                  pushLog('Loop finished (end of list)');
                } else {
                  kpjIndexRef.current = nextIndex;
                  setKpjIndex(nextIndex);
                  pendingStepRef.current = 5;
                  setPendingStep(5);
                  lastStep5UrlRef.current = null;
                  injectSteps5to8ForKpj(kpjList[nextIndex]);
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
            <View style={styles.modalHeaderRight}>
              <TouchableOpacity onPress={refreshKpjList}>
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setListOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
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
  modalHeaderRight: {
    flexDirection: 'row',
    gap: normalize(14),
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: normalize(16),
    fontWeight: '800',
    color: '#111',
  },
  refreshText: {
    fontSize: normalize(14),
    fontWeight: '700',
    color: '#007AFF',
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


