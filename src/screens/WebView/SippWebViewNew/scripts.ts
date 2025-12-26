/**
 * JavaScript injection scripts for BPJS SIPP Automation
 */

import { SELECTORS, URLS, MESSAGES, DEFAULT_CONFIG } from './config';
import { createPostFunction, createClickFunction, createFirstValueFunction, createOnlyDigitsFunction, createSelectedTextFunction } from './utils';

/**
 * Script to auto-redirect after login
 */
export function createAutoRedirectScript(formUrl: string): string {
  return `
    (function () {
      ${createPostFunction()}
      
      try {
        var href = location.href;
        
        // Check if already on form page
        if (href.indexOf('${formUrl.replace(/\//g, '\\/')}') !== -1) {
          post(true, {phase:'already_on_form', url: href});
          return;
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
          location.href = '${formUrl}';
          post(true, {phase:'redirect', url:'${formUrl}'});
        } else {
          post(true, {phase:'no_action', url: href, hasLogout: hasLogout, hasPassword: hasPassword});
        }
      } catch (e) {
        post(false, {phase:'error', reason:String(e)});
      }
    })();
    true;
  `;
}

/**
 * Script for Steps 5-8: Fill form and check result
 */
export function createSteps5to8Script(kpj: string, config = DEFAULT_CONFIG): string {
  return `
    (function () {
      ${createPostFunction()}
      ${createClickFunction()}
      
      var kpj = ${JSON.stringify(kpj)};
      
      // Step 5: click "Sudah"
      (function clickSudah(){
        var sudah = document.querySelector('${SELECTORS.SUDAH_BUTTON}');
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
      
      // Step 6 & 7: Wait for input #kpj then fill + click Lanjut
      var attempts = 0;
      var maxAttempts = 80; // ~20s
      var interval = setInterval(function(){
        attempts++;
        var input = document.querySelector('${SELECTORS.KPJ_INPUT}');
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
          lanjut = document.querySelector('${SELECTORS.LANJUT_BUTTON}');
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
        var sMax = ${config.step8MaxAttempts};
        var sInterval = setInterval(function(){
          sAttempts++;
          var contentEl = document.querySelector('${SELECTORS.SWAL_CONTENT}');
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
          var tidakDapatDigunakan = low.indexOf('${MESSAGES.KPJ_CANNOT_USE}') !== -1;
          // Check for "terdaftar sebagai peserta BPJS Ketenagakerjaan"
          var registered = low.indexOf('${MESSAGES.KPJ_REGISTERED}') !== -1;
          
          if (tidakDapatDigunakan) {
            // Case: KPJ tidak dapat digunakan - klik OK dan lanjut ke KPJ berikutnya
            var okBtn = document.querySelector('${SELECTORS.OK_BUTTON}.swal2-styled') || null;
            if (!okBtn) {
              okBtn = Array.prototype.slice.call(document.querySelectorAll('button'))
                .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'ok'); }) || null;
            }
            if (!okBtn) {
              okBtn = document.querySelector('${SELECTORS.OK_BUTTON}');
            }
            if (okBtn) {
              clickWithEvent(okBtn);
              post(8, true, {kpj: kpj, found:false, cannotUse:true, text: txt});
            } else {
              post(8, false, {reason:'OK button not found (cannot use)', kpj: kpj});
            }
          } else if (registered) {
            // Case: Terdaftar - klik Lanjutkan untuk ke profile page
            var lanjutkan = document.querySelector('${SELECTORS.LANJUTKAN_BUTTON}.swal2-styled') || null;
            if (!lanjutkan) {
              lanjutkan = Array.prototype.slice.call(document.querySelectorAll('button'))
                .find(function(b){ return ((b.textContent || '').trim().toLowerCase() === 'lanjutkan'); }) || null;
            }
            if (!lanjutkan) {
              lanjutkan = document.querySelector('${SELECTORS.LANJUTKAN_BUTTON}');
            }
            if (lanjutkan) {
              clickWithEvent(lanjutkan);
              // After clicking Lanjutkan, check for additional "Lanjut" button in modal
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
              okBtn = document.querySelector('${SELECTORS.OK_BUTTON}');
            }
            if (okBtn) {
              clickWithEvent(okBtn);
              post(8, true, {kpj: kpj, found:false, text: txt});
            } else {
              post(8, false, {reason:'OK button not found', kpj: kpj});
            }
          }
          
          clearInterval(sInterval);
        }, ${config.step8Interval});
      }, ${config.step6Delay});
    })();
    true;
  `;
}

/**
 * Script to check if profile page fields are ready
 */
export function createProfileCheckScript(): string {
  return `
    (function() {
      function checkFields() {
        var hasNik = document.querySelector('${SELECTORS.NIK_FIELDS[0]}, ${SELECTORS.NIK_FIELDS.slice(1).join(', ')}');
        var hasBirthdate = document.querySelector('${SELECTORS.BIRTHDATE_FIELDS[0]}, ${SELECTORS.BIRTHDATE_FIELDS.slice(1).join(', ')}');
        var hasName = document.querySelector('${SELECTORS.NAME_FIELDS[0]}, ${SELECTORS.NAME_FIELDS[1]}');
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
        setTimeout(function(){
          checkFields();
        }, 1000);
      } else {
        checkFields();
      }
    })();
    true;
  `;
}

/**
 * Script for Step 9: Extract profile data
 */
export function createStep9ExtractScript(config = DEFAULT_CONFIG): string {
  return `
    (function () {
      ${createPostFunction()}
      ${createFirstValueFunction(SELECTORS.NIK_FIELDS)}
      ${createFirstValueFunction(SELECTORS.NAME_FIELDS)}
      ${createFirstValueFunction(SELECTORS.BIRTHDATE_FIELDS)}
      ${createFirstValueFunction(SELECTORS.GENDER_FIELDS)}
      ${createFirstValueFunction(SELECTORS.ADDRESS_FIELDS)}
      ${createFirstValueFunction(SELECTORS.POSTAL_CODE_FIELDS)}
      ${createFirstValueFunction(SELECTORS.PHONE_FIELDS)}
      ${createFirstValueFunction(SELECTORS.NPWP_FIELDS)}
      ${createFirstValueFunction(SELECTORS.EMAIL_FIELDS)}
      ${createOnlyDigitsFunction()}
      ${createSelectedTextFunction(['#status_kawin', 'select[name="status_kawin"]'])}
      
      function guessNikFromInputs() {
        var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
        for (var i = 0; i < inputs.length; i++) {
          var val = (inputs[i].value || '').trim();
          var name = ((inputs[i].name || '') + (inputs[i].id || '')).toLowerCase();
          if (val.length >= 8 && /^\\d+$/.test(val) && (name.indexOf('nik') !== -1 || name.indexOf('identitas') !== -1)) {
            return val;
          }
        }
        return '';
      }
      
      function extract() {
        var rawNik =
          firstVal(['${SELECTORS.NIK_FIELDS.join("','")}']) ||
          guessNikFromInputs();
        var nikDigits = onlyDigits(rawNik);
        var payload = {
          kpj: firstVal(['#kpj','input[name="kpj"]']),
          nik: nikDigits,
          name: firstVal(['${SELECTORS.NAME_FIELDS.join("','")}']),
          birthdate: firstVal(['${SELECTORS.BIRTHDATE_FIELDS.join("','")}']),
          gender: firstVal(['${SELECTORS.GENDER_FIELDS.join("','")}']),
          marritalStatus: selectedText(['#status_kawin','select[name="status_kawin"]']),
          address: firstVal(['${SELECTORS.ADDRESS_FIELDS.join("','")}']),
          postalCode: firstVal(['${SELECTORS.POSTAL_CODE_FIELDS.join("','")}']),
          phone: firstVal(['${SELECTORS.PHONE_FIELDS.join("','")}']),
          npwp: firstVal(['${SELECTORS.NPWP_FIELDS.join("','")}']),
          email: firstVal(['${SELECTORS.EMAIL_FIELDS.join("','")}']),
          validasiDPT: false
        };
        return payload;
      }
      
      // Wait until key fields appear (NIK or Birthdate) to avoid extracting too early
      var attempts = 0;
      var maxAttempts = ${config.step9MaxAttempts};
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
      }, ${config.step9Interval});
    })();
    true;
  `;
}
