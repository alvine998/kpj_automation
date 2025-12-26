/**
 * Configuration for BPJS SIPP Automation
 */

import { AutomationConfig } from './types';

export const DEFAULT_CONFIG: AutomationConfig = {
  step5Delay: 200,           // 200ms delay before step 5
  step6Delay: 500,           // 500ms delay before step 6
  step7Delay: 500,           // 500ms delay before step 7
  step8MaxAttempts: 80,      // Max 80 attempts (~20 seconds)
  step8Interval: 1000,       // Check every 1 second
  step9MaxAttempts: 30,      // Max 30 attempts (~30 seconds)
  step9Interval: 1000,       // Check every 1 second
  loadingCheckInterval: 500, // Check loading state every 500ms
  defaultTimeout: 20000,     // 20 seconds default timeout
};

export const URLS = {
  BASE: 'https://sipp.bpjsketenagakerjaan.go.id/',
  FORM: 'https://sipp.bpjsketenagakerjaan.go.id/tenaga-kerja/baru/form-tambah-tk-individu',
  KPJ_FORM: 'https://sipp.bpjsketenagakerjaan.go.id/tenaga-kerja/baru/form-tambah/kpj',
} as const;

export const SELECTORS = {
  // Step 5: Sudah button
  SUDAH_BUTTON: 'button[href="#collapseTwo"]',
  
  // Step 6: KPJ input
  KPJ_INPUT: 'input#kpj',
  
  // Step 7: Lanjut button
  LANJUT_BUTTON: 'button.btn.btn-primary.btn-bordered.waves-effect.w-md',
  
  // Step 8: Result dialog
  SWAL_CONTENT: '.swal2-content',
  OK_BUTTON: 'button.swal2-confirm',
  LANJUTKAN_BUTTON: 'button.swal2-confirm.btn.btn-success',
  
  // Step 9: Profile fields
  NIK_FIELDS: ['#no_identitas', 'input[name="no_identitas"]', '#nik', 'input[name="nik"]', 'input[name="no_identitas_peserta"]'],
  NAME_FIELDS: ['#nama_lengkap', 'input[name="nama_lengkap"]'],
  BIRTHDATE_FIELDS: ['#tgl_lahir', 'input[name="tgl_lahir"]', '#birthdate', 'input[name="birthdate"]'],
  GENDER_FIELDS: ['#jenis_kelamin', 'input[name="jenis_kelamin"]', '#gender', 'input[name="gender"]'],
  ADDRESS_FIELDS: ['#alamat', 'input[name="alamat"]', '#address', 'input[name="address"]'],
  POSTAL_CODE_FIELDS: ['#kode_pos', 'input[name="kode_pos"]'],
  PHONE_FIELDS: ['#no_handphone', 'input[name="no_handphone"]', '#phone', 'input[name="phone"]'],
  NPWP_FIELDS: ['#npwp', 'input[name="npwp"]'],
  EMAIL_FIELDS: ['#email', 'input[name="email"]'],
} as const;

export const MESSAGES = {
  KPJ_CANNOT_USE: 'sudah tidak dapat digunakan',
  KPJ_REGISTERED: 'terdaftar sebagai peserta bpjs ketenagakerjaan',
} as const;
