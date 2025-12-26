/**
 * Types and interfaces for BPJS SIPP Automation
 */

export type AutomationStep = 0 | 5 | 6 | 7 | 8 | 9;

export type AutomationState = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface AutomationConfig {
  step5Delay: number;        // Delay before step 5 (ms)
  step6Delay: number;        // Delay before step 6 (ms)
  step7Delay: number;        // Delay before step 7 (ms)
  step8MaxAttempts: number;  // Max attempts for step 8
  step8Interval: number;     // Interval for step 8 checks (ms)
  step9MaxAttempts: number;  // Max attempts for step 9
  step9Interval: number;     // Interval for step 9 checks (ms)
  loadingCheckInterval: number; // Interval for loading state checks (ms)
  defaultTimeout: number;    // Default timeout (ms)
}

export interface KpjData {
  kpj: string;
  nik?: string;
  nama?: string;
}

export interface ProfileData {
  kpj: string;
  nik: string;
  name: string;
  birthdate: string;
  gender?: string;
  marritalStatus?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
  npwp?: string;
  email?: string;
}

export interface AutomationLog {
  timestamp: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

export interface AutomationProgress {
  total: number;
  checked: number;
  found: number;
  notFound: number;
  currentIndex: number;
  currentKpj?: string;
}

export interface Step8Result {
  ok: boolean;
  found: boolean;
  kpj: string;
  cannotUse?: boolean;
  reason?: string;
  text?: string;
}

export interface Step9Result {
  ok: boolean;
  kpj: string;
  nik?: string;
  name?: string;
  birthdate?: string;
  gender?: string;
  marritalStatus?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
  npwp?: string;
  email?: string;
  reason?: string;
}

export interface WebViewMessage {
  type: 'process' | 'profileCheck' | 'autoRedirect' | 'step9Unlock';
  step?: AutomationStep;
  ok?: boolean;
  kpj?: string;
  found?: boolean;
  cannotUse?: boolean;
  reason?: string;
  text?: string;
  ready?: boolean;
  hasNik?: boolean;
  hasBirthdate?: boolean;
  hasName?: boolean;
  url?: string;
  phase?: string;
  // Profile data
  nik?: string;
  name?: string;
  birthdate?: string;
  gender?: string;
  marritalStatus?: string;
  address?: string;
  postalCode?: string;
  phone?: string;
  npwp?: string;
  email?: string;
}
