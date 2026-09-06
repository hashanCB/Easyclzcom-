import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
// @noble/hashes + @noble/ciphers: pure-JS crypto that works in Hermes / Expo Go.
// crypto.subtle is NOT available in React Native's Hermes engine.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
// Type-only import — erased at compile time, so it does NOT pull the SQLite
// schema/runtime into the web bundle (repos are still require()'d lazily below).
import type {
  Class, Student, StudentClass, QuestionBankItem, ExtraClass,
  Payment, PaymentCorrection, Attendance,
} from '../../db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupData {
  version: 1;
  exportedAt: string;
  teacherId: string;
  classes: Class[];
  students: Student[];
  /** Many-to-many class enrollments. Optional — absent in pre-multi-class backups. */
  studentClasses?: StudentClass[];
  /** Per-class question bank. Optional — absent in older backups. */
  questionBank?: QuestionBankItem[];
  /** One-off extra classes. Optional — absent in older backups. */
  extraClasses?: ExtraClass[];
  payments: Payment[];
  paymentCorrections: PaymentCorrection[];
  attendance: Attendance[];
}

interface EncryptedEnvelope {
  v: 1;
  salt: string;   // hex
  iv: string;     // hex
  data: string;   // base64
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function toBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    result[i] = binary.charCodeAt(i);
  }
  return result;
}

// PBKDF2-SHA256, 100k iterations, 32-byte output (AES-256 key).
async function deriveKeyBytes(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  return pbkdf2Async(sha256, enc.encode(password), salt, { c: 100_000, dkLen: 32 });
}

// ---------------------------------------------------------------------------
// Export — collect all data from repos
// ---------------------------------------------------------------------------

function loadAllRepos() {
  if (Platform.OS === 'web') throw new Error('Backup not available on web.');
  const { classesRepo } = require('../../db/repositories/classesRepo') as typeof import('../../db/repositories/classesRepo');
  const { studentsRepo } = require('../../db/repositories/studentsRepo') as typeof import('../../db/repositories/studentsRepo');
  const { paymentsRepo } = require('../../db/repositories/paymentsRepo') as typeof import('../../db/repositories/paymentsRepo');
  const { paymentCorrectionsRepo } = require('../../db/repositories/paymentCorrectionsRepo') as typeof import('../../db/repositories/paymentCorrectionsRepo');
  const { attendanceRepo } = require('../../db/repositories/attendanceRepo') as typeof import('../../db/repositories/attendanceRepo');
  const { studentClassesRepo } = require('../../db/repositories/studentClassesRepo') as typeof import('../../db/repositories/studentClassesRepo');
  const { questionBankRepo } = require('../../db/repositories/questionBankRepo') as typeof import('../../db/repositories/questionBankRepo');
  const { extraClassesRepo } = require('../../db/repositories/extraClassesRepo') as typeof import('../../db/repositories/extraClassesRepo');
  return { classesRepo, studentsRepo, paymentsRepo, paymentCorrectionsRepo, attendanceRepo, studentClassesRepo, questionBankRepo, extraClassesRepo };
}

export type ExportStage = 'collecting' | 'key-derive' | 'encrypting' | 'serialising';

/** Yields the JS thread so React can flush pending state updates before sync-heavy work. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function createBackup(
  teacherId: string,
  password: string,
  onProgress?: (stage: ExportStage) => void | Promise<void>,
): Promise<string> {
  await onProgress?.('collecting');
  await tick();

  const { classesRepo, studentsRepo, paymentsRepo, paymentCorrectionsRepo, attendanceRepo, studentClassesRepo, questionBankRepo, extraClassesRepo } =
    loadAllRepos();

  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    teacherId,
    classes: classesRepo.findAll(teacherId),
    students: studentsRepo.findAll({ teacherId }),
    studentClasses: studentClassesRepo.findAllByTeacher(teacherId),
    questionBank: questionBankRepo.findAllByTeacher(teacherId),
    extraClasses: extraClassesRepo.findAllByTeacher(teacherId),
    payments: paymentsRepo.findAll({ teacherId }),
    paymentCorrections: paymentCorrectionsRepo.findAllByTeacher(teacherId),
    attendance: attendanceRepo.findAllByTeacher(teacherId),
  };

  const json = JSON.stringify(data);
  const enc = new TextEncoder();
  const plaintext = enc.encode(json);

  const salt = ExpoCrypto.getRandomValues(new Uint8Array(16));
  const iv   = ExpoCrypto.getRandomValues(new Uint8Array(12));

  await onProgress?.('key-derive');
  await tick();
  const key  = await deriveKeyBytes(password, salt);

  await onProgress?.('encrypting');
  await tick();
  // gcm().encrypt() returns ciphertext || 16-byte GCM tag
  const ciphertext = gcm(key, iv).encrypt(plaintext);

  await onProgress?.('serialising');
  await tick();
  const envelope: EncryptedEnvelope = {
    v: 1,
    salt: toHex(salt),
    iv:   toHex(iv),
    data: toBase64(ciphertext),
  };

  return JSON.stringify(envelope);
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export async function decryptBackup(
  encryptedJson: string,
  password: string,
): Promise<BackupData> {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(encryptedJson) as EncryptedEnvelope;
  } catch {
    throw new Error('Invalid backup file format.');
  }

  if (envelope.v !== 1) throw new Error(`Unsupported backup version: ${envelope.v}`);

  const salt       = fromHex(envelope.salt);
  const iv         = fromHex(envelope.iv);
  const ciphertext = fromBase64(envelope.data);

  let plaintext: Uint8Array;
  try {
    const key = await deriveKeyBytes(password, salt);
    // gcm().decrypt() validates the GCM tag and throws if the password is wrong
    plaintext = gcm(key, iv).decrypt(ciphertext);
  } catch {
    throw new Error('Wrong password or corrupted backup.');
  }

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext)) as BackupData;
}

export async function restoreBackup(data: BackupData, teacherId: string): Promise<void> {
  const { classesRepo, studentsRepo, paymentsRepo, paymentCorrectionsRepo, attendanceRepo, studentClassesRepo, questionBankRepo, extraClassesRepo } =
    loadAllRepos();

  if (data.teacherId !== teacherId) {
    throw new Error(
      `Backup belongs to a different teacher (${data.teacherId}). Current teacher: ${teacherId}.`,
    );
  }

  classesRepo.deleteAllByTeacher(teacherId);
  studentsRepo.deleteAllByTeacher(teacherId);
  studentClassesRepo.deleteAllByTeacher(teacherId);
  questionBankRepo.deleteAllByTeacher(teacherId);
  extraClassesRepo.deleteAllByTeacher(teacherId);
  paymentsRepo.deleteAllByTeacher(teacherId);
  paymentCorrectionsRepo.deleteAllByTeacher(teacherId);
  attendanceRepo.deleteAllByTeacher(teacherId);

  for (const row of data.classes)              classesRepo.upsert(row);
  for (const row of data.students)             studentsRepo.upsert(row);
  for (const row of data.studentClasses ?? []) studentClassesRepo.upsert(row);
  for (const row of data.questionBank ?? [])   questionBankRepo.upsert(row);
  for (const row of data.extraClasses ?? [])   extraClassesRepo.upsert(row);
  for (const row of data.payments)             paymentsRepo.upsert(row);
  for (const row of data.paymentCorrections)   paymentCorrectionsRepo.upsert(row);
  for (const row of data.attendance)           attendanceRepo.upsert(row);
}
