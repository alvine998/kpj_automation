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
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {db} from '../../utils/firebase';

export default function SippWebView() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const webRef = useRef<WebView>(null);
  const SIPP_FORM_URL =
    'https://sipp.bpjsketenagakerjaan.go.id/tenaga-kerja/baru/form-tambah-tk-individu';
  const [listOpen, setListOpen] = useState(false);
  const [kpjList, setKpjList] = useState<string[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>(
    'https://sipp.bpjsketenagakerjaan.go.id/',
  );
  const [webSourceUrl, setWebSourceUrl] = useState<string>(
    'https://sipp.bpjsketenagakerjaan.go.id/',
  );
  const [debugOpen, setDebugOpen] = useState(true);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  // Only run automation after user explicitly presses Process.
  const [processArmed, setProcessArmed] = useState(false);
  const processArmedRef = useRef(false);
  const loopInitializedRef = useRef(false);
  const [pendingStep, setPendingStep] = useState<0 | 5 | 9 | 11>(0);
  const pendingStepRef = useRef<0 | 5 | 9 | 11>(0);
  const lastStep5UrlRef = useRef<string | null>(null);
  const lastStep9UrlRef = useRef<string | null>(null);
  const lastStep11UrlRef = useRef<string | null>(null);
  const kpjIndexRef = useRef<number>(0);
  const [kpjIndex, setKpjIndex] = useState(0);
  const checkedSetRef = useRef<Set<string>>(new Set());
  const [checkedCount, setCheckedCount] = useState(0);
  const [foundCount, setFoundCount] = useState(0);
  const [notFoundCount, setNotFoundCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const foundKpjRef = useRef<string | null>(null);
  const foundUserDocIdRef = useRef<string | null>(null);
  const foundNikRef = useRef<string | null>(null);
  // Race condition guards
  const step9InjectionLockRef = useRef<boolean>(false);
  const step5InjectionLockRef = useRef<boolean>(false);
  const step5StartTimeRef = useRef<number>(0); // Track when step 5 injection started
  const profileCheckLockRef = useRef<boolean>(false);

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
      setRole(s?.role ?? null);
      // Hide debug by default for non-admin users
      if (s?.role !== 'admin') {
        setDebugOpen(false);
      }
    })();
  }, []);

  const pushLog = (line: string) => {
    setDebugLogs(prev => {
      const next = [`${new Date().toLocaleTimeString()}  ${line}`, ...prev];
      return next.slice(0, 80);
    });
  };

  const markChecked = (kpjRaw: any) => {
    const kpj = String(kpjRaw ?? '').trim();
    if (!kpj) return;
    checkedSetRef.current.add(kpj);
    setCheckedCount(checkedSetRef.current.size);
  };

  const setArmed = (v: boolean) => {
    processArmedRef.current = v;
    setProcessArmed(v);
  };

  const normalizeUrl = (url: string) => url.replace(/\/+$/, '');
  const isSippUrl = (url: string) =>
    normalizeUrl(url).startsWith('https://sipp.bpjsketenagakerjaan.go.id');
  const isOnSippFormUrl = (url: string) =>
    normalizeUrl(url).startsWith(normalizeUrl(SIPP_FORM_URL));
  const isOnProfilePage = (url: string) => {
    const normalized = normalizeUrl(url);
    // Profile page is typically after clicking "Lanjutkan" - check for profile-related paths
    // Common patterns: /form-tambah/... (but not /form-tambah/kpj), or contains profile indicators
    // Also check if URL contains identifiers that suggest it's a profile/edit page
    const isFormTambah = normalized.includes('/form-tambah/');
    const isNotKpjPage = !normalized.endsWith('/kpj') && !normalized.endsWith('/form-tambah-tk-individu');
    const hasProfileIndicators = normalized.includes('/edit') || normalized.includes('/profile') || normalized.includes('/data');
    return (isFormTambah && isNotKpjPage) || hasProfileIndicators;
  };
  
  const checkProfilePageReady = () => {
    // Inject a quick check to see if profile fields are present
    // Also check for and handle any modal that might block the profile page
    webRef.current?.injectJavaScript(`
      (function() {
        function checkFields() {
          var hasNik = document.querySelector('#no_identitas, input[name="no_identitas"], #nik, input[name="nik"]');
          var hasBirthdate = document.querySelector('#tgl_lahir, input[name="tgl_lahir"], #birthdate, input[name="birthdate"]');
          var hasName = document.querySelector('#nama_lengkap, input[name="nama_lengkap"]');
          var isReady = (hasNik || hasBirthdate) && hasName;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'profileCheck',
            ready: isReady,
            hasNik: !!hasNik,
            hasBirthdate: !!hasBirthdate,
            hasName: !!hasName,
            url: location.href
          }));
        }
        
        // First, check if there's a modal with "Lanjut" button that needs to be clicked
        var modalLanjut = Array.prototype.slice.call(document.querySelectorAll('button'))
          .find(function(b){ 
            var txt = (b.textContent || '').trim().toLowerCase();
            var isLanjut = txt === 'lanjut';
            var isInModal = b.closest('.modal') || b.closest('.swal2-popup') || b.closest('[role="dialog"]');
            return isLanjut && isInModal;
          }) || null;
        
        if (modalLanjut) {
          console.log('[ProfileCheck] Found Lanjut button in modal, clicking it');
          try {
            modalLanjut.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
          } catch(e) {
            try { modalLanjut.click(); } catch(e2) {}
          }
          // Wait a bit after clicking, then check profile fields
          setTimeout(function(){
            checkFields();
          }, 1000);
        } else {
          checkFields();
        }
      })();
      true;
    `);
  };

  const withCacheBuster = (url: string) => {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Date.now()}`;
  };

  const resetStepUrls = () => {
    lastStep5UrlRef.current = null;
    lastStep9UrlRef.current = null;
    lastStep11UrlRef.current = null;
  };

  const injectAutoRedirectAfterLogin = () => {
    // Heuristic DOM check: if we look logged-in, jump to the TK individu form.
    webRef.current?.injectJavaScript(`
      (function () {
        function post(ok, extra) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:'autoRedirect', ok:ok}, extra || {})));
          } catch (e) {}
        }

        try {
          var href = (location && location.href) ? String(location.href) : '';
          var path = (location && location.pathname) ? String(location.pathname) : '';

          // Don't interfere if we are already on target.
          if (href.indexOf(${JSON.stringify(SIPP_FORM_URL)}) !== -1) {
            post(true, {phase:'already_on_target', url: href});
            return true;
          }

          // If we are on a login-ish page, do nothing.
          var looksLikeLoginUrl =
            path.toLowerCase().indexOf('login') !== -1 ||
            href.toLowerCase().indexOf('login') !== -1 ||
            href.toLowerCase().indexOf('auth') !== -1;

          if (looksLikeLoginUrl) {
            post(true, {phase:'login_page', url: href});
            return true;
          }

          // DOM heuristic: logged-in pages usually have a Logout/Keluar action and no password field.
          var hasPassword = !!document.querySelector('input[type="password"]');
          var links = Array.prototype.slice.call(document.querySelectorAll('a,button'));
          var hasLogout =
            !!document.querySelector('a[href*="logout"], a[href*="keluar"]') ||
            links.some(function(el){
              var t = ((el.textContent || '') + '').trim().toLowerCase();
              return t === 'logout' || t === 'keluar' || t.indexOf('logout') !== -1;
            });

          // If we see logout (and not on login form), assume authenticated.
          if (hasLogout && !hasPassword) {
            location.href = ${JSON.stringify(SIPP_FORM_URL)};
            post(true, {phase:'redirect', url:${JSON.stringify(SIPP_FORM_URL)}});
          } else {
            post(true, {phase:'no_action', url: href, hasLogout: hasLogout, hasPassword: hasPassword});
          }
        } catch (e) {
          post(false, {phase:'error', reason:String(e)});
        }
      })();
      true;
    `);
  };


  const injectSteps5to8ForKpj = (kpj: string) => {
    // Guard against race condition: prevent multiple simultaneous injections
    if (step5InjectionLockRef.current) {
      pushLog(`⚠️ Step 5-8 injection already in progress, skipping duplicate for KPJ ${kpj}`);
      return;
    }
    step5InjectionLockRef.current = true;
    step5StartTimeRef.current = Date.now();

    // Reset lock after 10 seconds (safety timeout)
    setTimeout(() => {
      step5InjectionLockRef.current = false;
    }, 10000);
    
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
            
            // Check for "KPJ sudah tidak dapat digunakan"
            var tidakDapatDigunakan = low.indexOf('sudah tidak dapat digunakan') !== -1;
            // Check for "terdaftar sebagai peserta BPJS Ketenagakerjaan"
            var registered = low.indexOf('terdaftar sebagai peserta bpjs ketenagakerjaan') !== -1;

            if (tidakDapatDigunakan) {
              // Case: KPJ tidak dapat digunakan - klik OK dan lanjut ke KPJ berikutnya
              var okBtn = document.querySelector('button.swal2-confirm.swal2-styled') || null;
              if (!okBtn) {
                okBtn = Array.prototype.slice.call(document.querySelectorAll('button'))
                  .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'ok'); }) || null;
              }
              if (!okBtn) {
                okBtn = document.querySelector('button.swal2-confirm');
              }
              if (okBtn) {
                clickWithEvent(okBtn);
                post(8, true, {kpj: kpj, found:false, cannotUse:true, text: txt});
              } else {
                post(8, false, {reason:'OK button not found (cannot use)', kpj: kpj});
              }
            } else if (registered) {
              // Case: Terdaftar - klik Lanjutkan untuk ke profile page
              var lanjutkan = document.querySelector('button.swal2-confirm.btn.btn-success.swal2-styled') || null;
              if (!lanjutkan) {
                lanjutkan = Array.prototype.slice.call(document.querySelectorAll('button'))
                  .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'lanjutkan'); }) || null;
              }
              if (!lanjutkan) {
                lanjutkan = document.querySelector('button.swal2-confirm.btn.btn-success');
              }
              if (lanjutkan) {
                clickWithEvent(lanjutkan);
                // After clicking Lanjutkan, there might be another modal asking about BPJS card
                // Wait a bit then check for additional "Lanjut" button and click it
                setTimeout(function(){
                  var additionalLanjut = Array.prototype.slice.call(document.querySelectorAll('button'))
                    .find(function(b){ 
                      var txt = (b.textContent || '').trim().toLowerCase();
                      return txt === 'lanjut' && (b.classList.contains('btn-primary') || b.classList.contains('btn-success'));
                    }) || null;
                  if (additionalLanjut) {
                    console.log('[Step 8] Found additional Lanjut button after Lanjutkan, clicking it');
                    clickWithEvent(additionalLanjut);
                  }
                }, 500);
                post(8, true, {kpj: kpj, found:true, text: txt});
              } else {
                post(8, false, {reason:'Lanjutkan button not found', kpj: kpj});
              }
            } else {
              // Other cases - try OK button
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
    // Guard against race condition: prevent multiple simultaneous injections
    if (step9InjectionLockRef.current) {
      pushLog('⚠️ Step 9 injection already in progress, skipping duplicate');
      return;
    }
    if (pendingStepRef.current !== 9) {
      pushLog(`⚠️ Step 9 injection called but pendingStep is ${pendingStepRef.current} (not 9), skipping`);
      return;
    }
    step9InjectionLockRef.current = true;
    pushLog('🔒🔒🔒 Step 9 injection lock acquired - starting extraction NOW');
    
    // Reset lock after 15 seconds (safety timeout) - increased for profile extraction
    // Lock will be released when step 9 message is received, but this is a safety net
    setTimeout(() => {
      if (step9InjectionLockRef.current) {
        pushLog('⚠️ Step 9 lock timeout - releasing lock (safety timeout)');
        step9InjectionLockRef.current = false;
      }
    }, 15000);
    
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

        function onlyDigits(s) {
          try { return String(s || '').replace(/\\D+/g, ''); } catch (e) {}
          return '';
        }

        function firstVal(selectors) {
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            var v = getVal(el);
            if (v) return v;
          }
          return '';
        }

        function guessNikFromInputs() {
          try {
            var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
            for (var i = 0; i < inputs.length; i++) {
              var el = inputs[i];
              var id = String(el.id || '').toLowerCase();
              var name = String(el.getAttribute('name') || '').toLowerCase();
              var ph = String(el.getAttribute('placeholder') || '').toLowerCase();
              if (id.indexOf('identitas') !== -1 || id.indexOf('nik') !== -1 ||
                  name.indexOf('identitas') !== -1 || name.indexOf('nik') !== -1 ||
                  ph.indexOf('nik') !== -1) {
                var v = onlyDigits(getVal(el));
                if (v && v.length >= 12) return v;
              }
            }
          } catch (e) {}
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
          var rawNik =
            firstVal(['#no_identitas','input[name="no_identitas"]','#nik','input[name="nik"]','input[name="no_identitas_peserta"]']) ||
            guessNikFromInputs();
          var nikDigits = onlyDigits(rawNik);
          var payload = {
            kpj: firstVal(['#kpj','input[name="kpj"]']),
            nik: nikDigits,
            name: firstVal(['#nama_lengkap','input[name="nama_lengkap"]']),
            birthdate: firstVal(['#tgl_lahir','input[name="tgl_lahir"]','#birthdate','input[name="birthdate"]']),
            gender: firstVal(['#jenis_kelamin','input[name="jenis_kelamin"]','#gender','input[name="gender"]']),
            marritalStatus: selectedText(['#status_kawin','select[name="status_kawin"]']),
            address: firstVal(['#alamat','input[name="alamat"]','#address','input[name="address"]']),
            postalCode: firstVal(['#kode_pos','input[name="kode_pos"]']),
            phone: firstVal(['#no_handphone','input[name="no_handphone"]','#phone','input[name="phone"]']),
            npwp: firstVal(['#npwp','input[name="npwp"]']),
            email: firstVal(['#email','input[name="email"]']),
            validasiLasik: "",
            validasiDPT: false
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
            console.log('[Step 9] Profile extracted:', JSON.stringify(payload));
            var fullPayload = Object.assign(payload, {attempts: attempts, url: location.href});
            console.log('[Step 9] Sending message with payload:', JSON.stringify(fullPayload));
            post(9, true, fullPayload);
            // Lock will be released after Firestore save completes or on error
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.log('[Step 9] Failed: Profile fields not ready. Sample:', JSON.stringify(payload));
            post(9, false, {reason:'Profile fields not ready (nik/birthdate empty)', attempts: attempts, url: location.href, sample: payload});
            // Release lock on failure - send unlock message
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({type:'step9Unlock'}));
            } catch (e) {
              console.error('[Step 9] Failed to send unlock message:', e);
            }
          } else {
            // Log progress every 5 attempts
            if (attempts % 5 === 0) {
              console.log('[Step 9] Waiting for profile... attempt', attempts, 'nik:', payload.nik, 'birthdate:', payload.birthdate);
            }
          }
        }, 1000);
      })();
      true;
    `);
    pushLog('✅ Injected step 9 (extract profile) - waiting for profile fields...');
    pushLog('📤 Step 9 JavaScript injected, waiting for extraction result...');
  };


  const onPressProcess = () => {
    pushLog('Process pressed (start from step 5)');
    // reset counters for a fresh run
    setFoundCount(0);
    setNotFoundCount(0);
    checkedSetRef.current = new Set();
    setCheckedCount(0);
    loopInitializedRef.current = true;

    if (!kpjList.length) {
      Alert.alert('KPJ list empty', 'Go to Beranda → Generate → Cari Data');
      pendingStepRef.current = 0;
      setPendingStep(0);
      setArmed(false);
      return;
    }

    // Always start from step 5 on the TK individu form.
    setArmed(true);
    pendingStepRef.current = 5;
    setPendingStep(5);
    kpjIndexRef.current = 0;
    setKpjIndex(0);
    checkedSetRef.current = new Set();
    setCheckedCount(0);
    resetStepUrls();

    if (!isOnSippFormUrl(currentUrl)) {
      // Navigate to the correct form first; step 5 will run on loadEnd.
      webRef.current?.injectJavaScript(`
        (function () {
          try { window.location.href = ${JSON.stringify(SIPP_FORM_URL)}; } catch (e) {}
        })();
        true;
      `);
      pushLog(`Navigate to form: ${SIPP_FORM_URL}`);
      return;
    }

    // Already on the form: run immediately.
    injectSteps5to8ForKpj(kpjList[0]);
  };

  const isRootUrl =
    normalizeUrl(currentUrl) === 'https://sipp.bpjsketenagakerjaan.go.id';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            SIPP
          </Text>
          <Text style={styles.topBarSubtitle} numberOfLines={1}>
            {normalizeUrl(currentUrl)}
          </Text>
          {/* <Text style={styles.topBarSubtitle} numberOfLines={1}>
            Progress: {checkedCount}/{kpjList.length || 0}
          </Text> */}
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={[styles.processBtn, isRootUrl && styles.processBtnDisabled]}
            onPress={onPressProcess}
            disabled={isRootUrl}>
            <Text style={styles.processBtnText}>Process</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={openKpjList}>
            <Text style={styles.iconBtnText}>KPJ</Text>
          </TouchableOpacity>

          {role === 'admin' ? (
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

      {role === 'admin' && debugOpen ? (
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

          // After login, auto-redirect to the target form (then step 5 can run).
          if (url && isSippUrl(url) && !isOnSippFormUrl(url)) {
            injectAutoRedirectAfterLogin();
          }

          // If step 5 pending, run it on the new page (or after navigation).
          if (pendingStepRef.current === 5 && url) {
            const normalized = normalizeUrl(url);
            if (lastStep5UrlRef.current !== normalized && !step5InjectionLockRef.current) {
              lastStep5UrlRef.current = normalized;
              const currentIndex = kpjIndexRef.current;
              const kpj = kpjList[currentIndex];
              pushLog(`Step 5 check: index=${currentIndex}, total=${kpjList.length}, kpj=${kpj ?? 'N/A'}, pendingStep=${pendingStepRef.current}`);
              if (kpj) {
                pushLog(`Step 5: Injecting for KPJ ${kpj} (index ${currentIndex}/${kpjList.length})`);
                injectSteps5to8ForKpj(kpj);
              } else if (currentIndex >= kpjList.length) {
                pushLog(`⚠️ Step 5: Index ${currentIndex} >= list length ${kpjList.length}, stopping loop`);
                pendingStepRef.current = 0;
                setPendingStep(0);
                setArmed(false);
                loopInitializedRef.current = false;
              } else {
                pushLog(`⚠️ Step 5: KPJ not found at index ${currentIndex}, but index < length. Continuing...`);
              }
            } else if (step5InjectionLockRef.current) {
              pushLog('Step 5: Injection locked, skipping');
              // Check if step 5-8 has been running for too long (>15 seconds) - timeout recovery
              const elapsed = Date.now() - step5StartTimeRef.current;
              if (elapsed > 15000) {
                pushLog(`⚠️ Step 5-8 timeout detected (${elapsed}ms elapsed) - continuing to next KPJ`);
                step5InjectionLockRef.current = false;
                const nextIndex = kpjIndexRef.current + 1;
                if (nextIndex >= kpjList.length) {
                  pendingStepRef.current = 0;
                  setPendingStep(0);
                  setArmed(false);
                  loopInitializedRef.current = false;
                  pushLog('Step 5-8 timeout - loop finished (end of list)');
                } else {
                  kpjIndexRef.current = nextIndex;
                  setKpjIndex(nextIndex);
                  lastStep5UrlRef.current = null;
                  resetStepUrls();
                  setWebSourceUrl(withCacheBuster(`${SIPP_FORM_URL}#`));
                  pushLog(`Step 5-8 timeout → back to form, will continue with next KPJ (index ${nextIndex})`);
                }
              }
            }
          }

          // If step 9 pending, extract profile on the new page.
          // Only check if we're NOT on the KPJ form page (we need to be on the profile page)
          if (pendingStepRef.current === 9 && url) {
            const normalized = normalizeUrl(url);
            const isOnKpjForm = normalized.includes('/form-tambah/kpj') || normalized.endsWith('/kpj') || normalized.includes('/form-tambah-tk-individu');
            const isProfile = isOnProfilePage(url);
            pushLog(`🔍 Step 9 pending: url=${url}, isKpjForm=${isOnKpjForm}, isProfile=${isProfile}, lastStep9Url=${lastStep9UrlRef.current}, lock=${step9InjectionLockRef.current}`);
            
            // Only check profile fields if we're NOT on the KPJ form page (we need to be on profile page after clicking Lanjutkan)
            if (!isOnKpjForm && !step9InjectionLockRef.current) {
              // Always check if profile fields are ready before injecting
              if (lastStep9UrlRef.current !== normalized) {
                // URL changed to profile page - check profile fields
                pushLog(`🔄 Step 9: URL changed to profile page (${lastStep9UrlRef.current} → ${normalized}), checking profile fields readiness`);
                lastStep9UrlRef.current = normalized;
                checkProfilePageReady();
              } else {
                // Same URL (profile page) - check again (fields might load via AJAX)
                pushLog(`🔄 Step 9: Same profile URL (${normalized}), re-checking profile fields (might have loaded via AJAX)`);
                checkProfilePageReady();
                // Retry check in case fields loaded after initial check
                setTimeout(() => {
                  if (pendingStepRef.current === 9 && !step9InjectionLockRef.current) {
                    pushLog(`🔄 Step 9: Retry checking profile fields after 1s (URL: ${normalized})`);
                    checkProfilePageReady();
                  } else {
                    pushLog(`⏸️ Step 9: Retry skipped - pendingStep=${pendingStepRef.current}, lock=${step9InjectionLockRef.current}`);
                  }
                }, 1000);
              }
              // Will inject step 9 when profileCheck message confirms fields are ready
            } else if (isOnKpjForm) {
              pushLog(`⏸️ Step 9: Still on KPJ form page (${normalized}), waiting for navigation to profile page...`);
              // Don't check yet - we're still on the form page, need to wait for navigation after clicking Lanjutkan
            } else if (step9InjectionLockRef.current) {
              pushLog('⏸️ Step 9: Injection locked (lock=true), will retry after unlock');
              // Try to check anyway after a delay if still locked
              setTimeout(() => {
                if (pendingStepRef.current === 9 && !step9InjectionLockRef.current) {
                  pushLog('🔄 Step 9: Lock released, checking profile fields now');
                  checkProfilePageReady();
                }
              }, 2000);
            }
          }

          // Step 11 is now handled in step 9's finally block
          // This section is kept for backward compatibility
        }}
        onMessage={e => {
          try {
            pushLog(`msg: ${e.nativeEvent.data}`);
            const msg = JSON.parse(e.nativeEvent.data);
            
            // Handle profile page readiness check
            if (msg?.type === 'profileCheck' && pendingStepRef.current === 9) {
              // Guard against race condition: prevent multiple concurrent profile checks
              if (profileCheckLockRef.current) {
                pushLog('⚠️ Profile check already in progress, ignoring duplicate');
                return;
              }
              
              const isReady = msg?.ready === true;
              const url = msg?.url || currentUrl;
              const normalized = normalizeUrl(url);
              const isOnKpjForm = normalized.includes('/form-tambah/kpj') || normalized.endsWith('/kpj') || normalized.includes('/form-tambah-tk-individu');
              
              pushLog(`🔍 Profile check received: ready=${isReady}, hasNik=${msg?.hasNik}, hasBirthdate=${msg?.hasBirthdate}, hasName=${msg?.hasName}, url=${url}, isKpjForm=${isOnKpjForm}, lock=${step9InjectionLockRef.current}, pendingStep=${pendingStepRef.current}`);
              
              // IMPORTANT: Only proceed if we're NOT on the KPJ form page (we need to be on profile page)
              if (isReady && !isOnKpjForm) {
                pushLog(`✅✅✅ Profile fields ARE READY on profile page! lock=${step9InjectionLockRef.current}, pendingStep=${pendingStepRef.current}`);
                
                if (!step9InjectionLockRef.current && pendingStepRef.current === 9) {
                  profileCheckLockRef.current = true;
                  lastStep9UrlRef.current = normalized;
                  pushLog(`🚀🚀🚀 Step 9: Profile fields ready on profile page, CALLING injectStep9ExtractProfile() NOW (url: ${url})`);
                  injectStep9ExtractProfile();
                } else {
                  if (step9InjectionLockRef.current) {
                    pushLog(`⚠️⚠️ Step 9: Profile fields ready BUT injection lock is TRUE, will retry after unlock`);
                  } else if (pendingStepRef.current !== 9) {
                    pushLog(`⚠️⚠️ Step 9: Profile fields ready BUT pendingStep is ${pendingStepRef.current} (not 9), skipping injection`);
                  }
                  // Retry after lock is released
                  setTimeout(() => {
                    if (pendingStepRef.current === 9 && !step9InjectionLockRef.current) {
                      pushLog('🔄 Step 9: Retrying injection after unlock');
                      injectStep9ExtractProfile();
                    } else {
                      pushLog(`⏸️ Step 9: Retry skipped - pendingStep=${pendingStepRef.current}, lock=${step9InjectionLockRef.current}`);
                    }
                  }, 2000);
                }
                // Reset lock after 1 second
                setTimeout(() => {
                  profileCheckLockRef.current = false;
                }, 1000);
              } else if (isReady && isOnKpjForm) {
                pushLog(`⚠️⚠️ Profile check says ready=true BUT we're still on KPJ form page (${url}), IGNORING - waiting for navigation to profile page`);
              } else {
                pushLog(`⏳ Step 9: Profile fields not ready yet (hasNik=${msg?.hasNik}, hasBirthdate=${msg?.hasBirthdate}, hasName=${msg?.hasName})`);
                // Retry after delay if still pending (more aggressive retries)
                profileCheckLockRef.current = false; // Release lock immediately so we can retry
                setTimeout(() => {
                  if (pendingStepRef.current === 9 && !profileCheckLockRef.current) {
                    pushLog('Step 9: Retrying profile check after 2s...');
                    checkProfilePageReady();
                  }
                }, 2000);
                // Additional retry after 5 seconds
                setTimeout(() => {
                  if (pendingStepRef.current === 9 && !profileCheckLockRef.current && !step9InjectionLockRef.current) {
                    pushLog('Step 9: Retrying profile check after 5s (second attempt)...');
                    checkProfilePageReady();
                  }
                }, 5000);
              }
              return;
            }
            
            // Handle step 9 unlock message (from JavaScript on failure)
            if (msg?.type === 'step9Unlock') {
              step9InjectionLockRef.current = false;
              pushLog('Step 9 lock released (from JS)');
              return;
            }
            
            if (msg?.type === 'autoRedirect') {
              // If we redirected after login, ensure the process starts from step 5.
              if (msg?.phase === 'redirect' && processArmedRef.current) {
                pushLog(`Auto-redirected to form; starting step 5`);
                if (kpjList.length) {
                  pendingStepRef.current = 5;
                  setPendingStep(5);
                  // IMPORTANT: do not reset loop index during an active run,
                  // otherwise it will restart from the first KPJ.
                  if (!loopInitializedRef.current) {
                    kpjIndexRef.current = 0;
                    setKpjIndex(0);
                  }
                  lastStep5UrlRef.current = null;
                }
              } else if (msg?.phase === 'redirect') {
                // User hasn't pressed Process yet; do not start automation.
                pushLog('Auto-redirected to form (waiting for Process press)');
              }
              return;
            }
            if (msg?.type === 'process') {
              const step = msg?.step;
              const ok = msg?.ok === true;
              let text = 'Process';

              if (step === 5) {
                text = ok ? 'Clicked Sudah' : msg?.reason ?? 'Sudah not found';
              } else if (step === 6) {
                text = ok
                  ? `Input KPJ: ${msg?.kpj ?? ''}`
                  : msg?.reason ?? 'KPJ input failed';
              } else if (step === 7) {
                text = ok ? 'Clicked Lanjut' : msg?.reason ?? 'Lanjut not found';
              } else if (step === 8) {
                // Reset step 5-8 lock when step 8 completes (success or failure)
                step5InjectionLockRef.current = false;
                step5StartTimeRef.current = 0; // Reset timeout tracking
                
                if (ok && msg?.found === true) {
                  const kpj = String(msg?.kpj ?? '');
                  const currentIndex = kpjIndexRef.current;
                  text = `FOUND registered: ${kpj}`;
                  markChecked(kpj);
                  setFoundCount(c => c + 1);
                  foundKpjRef.current = kpj || null;
                  pushLog(`🎯 FOUND KPJ: ${kpj} at index ${currentIndex} → starting step 9 extraction`);
                  // ✅ Index must advance here (only step 8 may advance index).
                  // Next KPJ will run after we come back from form (step 11).
                  const nextIndex = kpjIndexRef.current + 1;
                  kpjIndexRef.current = nextIndex;
                  setKpjIndex(nextIndex);
                  pushLog(`📊 Progress: foundCount=${foundCount + 1}, checkedCount=${checkedCount + 1}, nextIndex=${nextIndex}`);
                  // After FOUND, extract profile first (NIK, etc), then go back to form.
                  // Always set pendingStep to 9 (even if already set) to ensure step 9 runs
                  // Clear previous step 9 state to allow fresh extraction
                  if (pendingStepRef.current === 9) {
                    pushLog(`⚠️ Step 9 was already pending for previous KPJ, resetting for new KPJ ${kpj}`);
                  }
                  pendingStepRef.current = 9;
                  setPendingStep(9);
                  lastStep9UrlRef.current = null; // Reset URL tracking for new profile page
                  // Ensure step 9 lock is released to allow injection
                  if (step9InjectionLockRef.current) {
                    pushLog('⚠️ Step 9 lock was still active, releasing it');
                    step9InjectionLockRef.current = false;
                  }
                  // Reset profile check lock too
                  profileCheckLockRef.current = false;
                  pushLog(`🔄 FOUND KPJ ${kpj} → step 9 (extract profile) then back to form`);
                  // Wait a bit for profile page to load, then check if fields are ready
                  // The onLoadEnd handler will trigger checkProfilePageReady() when page loads
                  // But also try to check immediately in case we're already on the profile page
                  pushLog(`⏱️ FOUND KPJ ${kpj}: Will check profile fields after 1.5s (onLoadEnd should also trigger check)`);
                  setTimeout(() => {
                    try {
                      if (pendingStepRef.current === 9 && !step9InjectionLockRef.current) {
                        pushLog(`🔄 Fallback: Checking profile fields for KPJ ${kpj} (profile might be on same page)`);
                        checkProfilePageReady();
                      } else if (step9InjectionLockRef.current) {
                        pushLog(`⏸️ Fallback: Step 9 injection locked for KPJ ${kpj}, will wait for unlock (lock=${step9InjectionLockRef.current})`);
                      } else {
                        pushLog(`⚠️ Fallback: Step 9 not pending anymore for KPJ ${kpj} (pendingStep=${pendingStepRef.current})`);
                      }
                    } catch (err: any) {
                      pushLog(`❌ Fallback error for KPJ ${kpj}: ${err?.message ?? String(err)}`);
                    }
                  }, 1500); // Wait 1.5s for profile fields to load
                } else if (ok && msg?.found === false) {
                  // This KPJ is fully "checked" (not registered or cannot be used).
                  markChecked(msg?.kpj);
                  const nextIndex = kpjIndexRef.current + 1;
                  setNotFoundCount(c => c + 1);
                  pushLog(`Step 8: Not found/Cannot use - nextIndex=${nextIndex}, listLength=${kpjList.length}`);
                  if (nextIndex >= kpjList.length) {
                    text = `No registered found (checked ${kpjList.length})`;
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    setArmed(false);
                    loopInitializedRef.current = false;
                    lastStep5UrlRef.current = null;
                    pushLog(`✅ All KPJs checked - loop finished (index ${nextIndex} >= ${kpjList.length})`);
                  } else {
                    text = msg?.cannotUse 
                      ? `Cannot use: ${msg?.kpj ?? ''} → next`
                      : `Not registered: ${msg?.kpj ?? ''} → next`;
                    kpjIndexRef.current = nextIndex;
                    setKpjIndex(nextIndex);
                    // Navigate back to form and continue with next KPJ
                    pendingStepRef.current = 5;
                    setPendingStep(5);
                    lastStep5UrlRef.current = null;
                    resetStepUrls();
                    setWebSourceUrl(withCacheBuster(`${SIPP_FORM_URL}#`));
                    pushLog(`Step 8: Returning to form for next KPJ at index ${nextIndex} (${nextIndex + 1}/${kpjList.length})`);
                  }
                } else {
                  // Step 8 failed - mark as checked and increment index, then continue to next KPJ
                  text = msg?.reason ?? 'Step 8 failed';
                  pushLog(`⚠️ Step 8 failed: ${text} - continuing to next KPJ`);
                  // Mark as checked even on failure to track progress
                  if (msg?.kpj) {
                    markChecked(msg.kpj);
                  }
                  const nextIndex = kpjIndexRef.current + 1;
                  if (nextIndex >= kpjList.length) {
                    // All KPJs processed
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    setArmed(false);
                    loopInitializedRef.current = false;
                    lastStep5UrlRef.current = null;
                    pushLog('Step 8 failed - loop finished (end of list)');
                  } else {
                    kpjIndexRef.current = nextIndex;
                    setKpjIndex(nextIndex);
                    // Navigate back to form and continue with next KPJ
                    pendingStepRef.current = 5;
                    setPendingStep(5);
                    lastStep5UrlRef.current = null;
                    resetStepUrls();
                    setWebSourceUrl(withCacheBuster(`${SIPP_FORM_URL}#`));
                    pushLog(`Step 8 failed → back to form, will continue with next KPJ (index ${nextIndex})`);
                  }
                }
              } else if (step === 9) {
                // Release lock immediately when step 9 message is received (extraction completed)
                step9InjectionLockRef.current = false;
                pushLog('🔓 Step 9 lock released (message received)');
                
                const currentKpj = String(msg?.kpj ?? '');
                pushLog(`📨 Step 9 message received: ok=${ok}, kpj=${currentKpj}, nik=${msg?.nik ?? 'N/A'}, userId=${userId ?? 'NULL'}, foundCount=${foundCount}, hasNik=${!!msg?.nik}, hasName=${!!msg?.name}`);
                if (ok && (msg?.nik || msg?.birthdate)) {
                  text = `Step 9 extracted: ${currentKpj}`;
                  pushLog(`📋 Step 9 extracted data for KPJ ${currentKpj}: ${JSON.stringify({kpj: msg?.kpj, nik: msg?.nik, birthdate: msg?.birthdate, name: msg?.name})}`);
                  
                  // Save to Firestore immediately (don't wait)
                  pushLog(`🔄 Starting Firestore save process for KPJ: ${currentKpj}`);
                  // Execute save immediately without wrapping in async IIFE to avoid potential issues
                  (async () => {
                    try {
                      pushLog(`DEBUG: userId=${userId}, hasUserId=${!!userId}, kpj=${currentKpj}`);
                      if (!userId) {
                        const errMsg = 'No userId in session';
                        pushLog(`❌ ERROR: ${errMsg}`);
                        throw new Error(errMsg);
                      }
                      // Guard: don't save empty profile rows
                      const nikRaw = String(msg?.nik ?? '');
                      const nik = nikRaw.replace(/\D+/g, '');
                      const birthdate = String(msg?.birthdate ?? '');
                      pushLog(`Step 9 validation: kpj=${currentKpj}, nik="${nik}", birthdate="${birthdate}"`);
                      if (!nik && !birthdate) {
                        const errMsg = 'Extracted empty profile (nik/birthdate empty)';
                        pushLog(`ERROR: ${errMsg}`);
                        throw new Error(errMsg);
                      }
                      const dataToSave = {
                        userId,
                        kpj: currentKpj,
                        nik: String(msg?.nik ?? ''),
                        name: String(msg?.name ?? ''),
                        birthdate: String(msg?.birthdate ?? ''),
                        gender: String(msg?.gender ?? ''),
                        marritalStatus: String(msg?.marritalStatus ?? ''),
                        address: String(msg?.address ?? ''),
                        postalCode: String(msg?.postalCode ?? ''),
                        phone: String(msg?.phone ?? ''),
                        npwp: String(msg?.npwp ?? ''),
                        email: String(msg?.email ?? ''),
                        validasiDPT: false,
                        createdAt: serverTimestamp(),
                        sourceUrl: currentUrl,
                      };
                      pushLog(`💾 Saving to Firestore (KPJ: ${currentKpj}): ${JSON.stringify({kpj: dataToSave.kpj, nik: dataToSave.nik, name: dataToSave.name})}`);
                      pushLog(`💾 Data to save keys: ${Object.keys(dataToSave).join(', ')}`);
                      const ref = await addDoc(collection(db, 'foundUser'), dataToSave);
                      pushLog(`✅✅✅ SAVED to Firestore foundUser: KPJ=${currentKpj} (docId: ${ref.id}, validasiDPT: false)`);
                      
                      // Show success toast
                      if (Platform.OS === 'android') {
                        ToastAndroid.show(`Data Berhasil Disimpan (KPJ: ${currentKpj})`, ToastAndroid.SHORT);
                      } else {
                        Alert.alert('Berhasil', `Data Berhasil Disimpan (KPJ: ${currentKpj})`);
                      }
                    } catch (err: any) {
                      const errMsg = `Firestore save error: ${err?.message ?? String(err)}`;
                      pushLog(`❌ ${errMsg}`);
                      console.error('Step 9 Firestore save error:', err);
                      if (Platform.OS === 'android') {
                        ToastAndroid.show(errMsg, ToastAndroid.LONG);
                      } else {
                        Alert.alert('Save Error', errMsg);
                      }
                      // Even on error, continue to next KPJ (error is logged, don't stop the loop)
                      pushLog(`⚠️ Step 9 save error, but continuing to next KPJ anyway`);
                    } finally {
                      // After saving profile, navigate back to form and continue with next KPJ
                      // NOTE: kpjIndexRef.current was already incremented in step 8 when FOUND
                      const currentIndex = kpjIndexRef.current;
                      pushLog(`Step 9 finally: currentIndex=${currentIndex}, listLength=${kpjList.length}, checked=${checkedCount}, found=${foundCount}`);
                      if (currentIndex >= kpjList.length) {
                        // All KPJs processed
                        pendingStepRef.current = 0;
                        setPendingStep(0);
                        setArmed(false);
                        loopInitializedRef.current = false;
                        pushLog(`✅ All KPJs processed - loop finished (index ${currentIndex} >= ${kpjList.length})`);
                      } else {
                        // Continue with next KPJ - navigate back to form
                        pendingStepRef.current = 5;
                        setPendingStep(5);
                        resetStepUrls();
                        lastStep5UrlRef.current = null;
                        setWebSourceUrl(withCacheBuster(`${SIPP_FORM_URL}#`));
                        pushLog(`Step 9 done → back to form, will continue with KPJ at index ${currentIndex} (${currentIndex + 1}/${kpjList.length})`);
                        // onLoadEnd will handle injecting step 5 when form loads
                      }
                    }
                  })();
                } else {
                  text = msg?.reason ?? 'Step 9 failed';
                  const failureReason = msg?.reason ?? 'Unknown reason';
                  const hasNoData = !msg?.nik && !msg?.birthdate;
                  pushLog(`❌ Step 9 failed: ${failureReason}, hasNik=${!!msg?.nik}, hasBirthdate=${!!msg?.birthdate}, hasNoData=${hasNoData}`);
                  
                  // If step 9 failed but we have some data, try to save anyway (might be partial data)
                  if (hasNoData && currentKpj) {
                    pushLog(`⚠️ Step 9 failed with no data for KPJ ${currentKpj}, but will try to continue anyway`);
                  }
                  
                  // Lock already released at the start of step 9 handler
                  // On failure, still try to continue with next KPJ
                  // NOTE: kpjIndexRef.current was already incremented in step 8 when FOUND
                  const currentIndex = kpjIndexRef.current;
                  pushLog(`Step 9 failed: currentIndex=${currentIndex}, listLength=${kpjList.length}`);
                  if (currentIndex >= kpjList.length) {
                    pendingStepRef.current = 0;
                    setPendingStep(0);
                    setArmed(false);
                    loopInitializedRef.current = false;
                    pushLog(`Step 9 failed - loop finished (end of list, index ${currentIndex} >= ${kpjList.length})`);
                  } else {
                    pendingStepRef.current = 5;
                    setPendingStep(5);
                    resetStepUrls();
                    lastStep5UrlRef.current = null;
                    setWebSourceUrl(withCacheBuster(`${SIPP_FORM_URL}#`));
                    pushLog(`Step 9 failed → back to form, will continue with KPJ at index ${currentIndex} (${currentIndex + 1}/${kpjList.length})`);
                  }
                }
              } else if (step === 11) {
                // Step 11 is now handled in step 9's finally block
                // This handler is kept for backward compatibility but should not be reached
                text = ok ? 'Back to form' : msg?.reason ?? 'Step 11 failed';
                pushLog('Step 11 received (should be handled by step 9)');
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
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#0b0b0b',
    paddingHorizontal: normalize(12),
    paddingTop: normalize(10),
    paddingBottom: normalize(8),
    maxHeight: normalize(300),
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


