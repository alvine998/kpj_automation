/**
 * Utility functions for BPJS SIPP Automation
 */

import { AutomationLog, AutomationStep, WebViewMessage } from './types';

/**
 * Create a log entry with timestamp
 */
export function createLog(message: string, type: AutomationLog['type'] = 'info'): AutomationLog {
  return {
    timestamp: new Date().toLocaleTimeString(),
    message,
    type,
  };
}

/**
 * Normalize URL for comparison
 */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Check if URL is the KPJ form page
 */
export function isKpjFormUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  return (
    normalized.includes('/form-tambah/kpj') ||
    normalized.endsWith('/kpj') ||
    normalized.includes('/form-tambah-tk-individu')
  );
}

/**
 * Check if URL is a profile page
 */
export function isProfilePageUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  const isFormTambah = normalized.includes('/form-tambah/');
  const isNotKpjPage = !normalized.endsWith('/kpj') && !normalized.endsWith('/form-tambah-tk-individu');
  const hasProfileIndicators = normalized.includes('/edit') || normalized.includes('/profile') || normalized.includes('/data');
  return (isFormTambah && isNotKpjPage) || hasProfileIndicators;
}

/**
 * Add cache buster to URL
 */
export function withCacheBuster(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${Date.now()}`;
}

/**
 * Parse WebView message
 */
export function parseWebViewMessage(data: string): WebViewMessage | null {
  try {
    return JSON.parse(data) as WebViewMessage;
  } catch {
    return null;
  }
}

/**
 * Create JavaScript code to post message back to React Native
 */
export function createPostFunction(): string {
  return `
    function post(step, ok, extra) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify(Object.assign({type:'process', step:step, ok:ok}, extra || {}))
        );
      } catch (e) {
        console.error('[BPJS Automation] Failed to post message:', e);
      }
    }
  `;
}

/**
 * Create JavaScript code for clicking element with events
 */
export function createClickFunction(): string {
  return `
    function clickWithEvent(el) {
      try {
        el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
        return true;
      } catch (e) {
        try { 
          el.click(); 
          return true; 
        } catch (e2) {
          console.error('[BPJS Automation] Failed to click:', e2);
        }
      }
      return false;
    }
  `;
}

/**
 * Find first element matching selectors
 */
export function createFirstValueFunction(selectors: string[]): string {
  return `
    function firstVal(selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el && el.value) return el.value;
      }
      return '';
    }
  `;
}

/**
 * Extract only digits from string
 */
export function createOnlyDigitsFunction(): string {
  return `
    function onlyDigits(s) {
      return (s || '').replace(/\\D+/g, '');
    }
  `;
}

/**
 * Get selected option text from select element
 */
export function createSelectedTextFunction(selectors: string[]): string {
  return `
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
  `;
}

/**
 * Validate step 9 result
 */
export function validateStep9Result(data: {
  nik?: string;
  birthdate?: string;
}): boolean {
  const nik = (data.nik || '').replace(/\D+/g, '');
  const birthdate = data.birthdate || '';
  return (nik.length >= 8) || (birthdate.length >= 4);
}
