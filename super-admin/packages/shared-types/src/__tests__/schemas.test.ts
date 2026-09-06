import { describe, expect, it } from 'vitest';
import {
  AssistantLoginInput,
  AttendanceStatus,
  ChangePasswordInput,
  ClassEntity,
  MoneyCents,
  PaymentStatus,
  StudentLoginInput,
  TimeOfDay,
} from '../index';

describe('enums', () => {
  it('PaymentStatus accepts valid values', () => {
    expect(PaymentStatus.parse('paid')).toBe('paid');
    expect(() => PaymentStatus.parse('weird')).toThrow();
  });

  it('AttendanceStatus accepts present/absent/late', () => {
    for (const v of ['present', 'absent', 'late'] as const) {
      expect(AttendanceStatus.parse(v)).toBe(v);
    }
  });
});

describe('common types', () => {
  it('MoneyCents rejects negatives and floats', () => {
    expect(MoneyCents.parse(0)).toBe(0);
    expect(MoneyCents.parse(1500)).toBe(1500);
    expect(() => MoneyCents.parse(-1)).toThrow();
    expect(() => MoneyCents.parse(1.5)).toThrow();
  });

  it('TimeOfDay validates HH:mm', () => {
    expect(TimeOfDay.parse('08:00')).toBe('08:00');
    expect(TimeOfDay.parse('23:59')).toBe('23:59');
    expect(() => TimeOfDay.parse('24:00')).toThrow();
    expect(() => TimeOfDay.parse('8:00')).toThrow();
  });
});

describe('login inputs', () => {
  it('StudentLoginInput requires 6-digit password', () => {
    expect(() => StudentLoginInput.parse({ student_code: 'S001', password: '12345' })).toThrow();
    expect(StudentLoginInput.parse({ student_code: 'S001', password: '123456' })).toBeTruthy();
  });

  it('AssistantLoginInput requires 8-digit password', () => {
    expect(() => AssistantLoginInput.parse({ username: 'asst', password: '1234567' })).toThrow();
    expect(AssistantLoginInput.parse({ username: 'asst', password: '12345678' })).toBeTruthy();
  });

  it('ChangePasswordInput rejects mismatched confirm', () => {
    expect(() =>
      ChangePasswordInput.parse({
        current_password: 'oldpassword',
        new_password: 'newpassword',
        confirm_password: 'different',
      })
    ).toThrow();
  });
});

describe('class entity', () => {
  it('rejects monthly_fee_cents floats', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000001',
      teacher_id: '00000000-0000-4000-8000-000000000002',
      created_at: '2026-05-07T00:00:00.000Z',
      updated_at: '2026-05-07T00:00:00.000Z',
      deleted_at: null,
      client_updated_at: '2026-05-07T00:00:00.000Z',
      synced_at: null,
      class_type: 'al' as const,
      custom_class_type: null,
      grade: '12',
      batch: 'A',
      subject: 'Maths',
      language: 'sinhala' as const,
      monthly_fee_cents: 1.5,
      location: null,
      remark: null,
      image_url: null,
      is_active: true,
      payment_reminder_day_of_month: null,
      payment_reminder_time: null,
      payment_reminder_active: true,
      class_day: 'monday' as const,
      class_start_time: '08:00',
      class_end_time: '10:00',
      qr_grace_minutes_before: 30,
      qr_grace_minutes_after: 30,
    };
    expect(() => ClassEntity.parse(base)).toThrow();
  });
});
