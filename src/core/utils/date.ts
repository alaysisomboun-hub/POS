import type { Timestamp } from 'firebase/firestore';

const TIMEZONE = 'Asia/Vientiane';

function toDate(value: Timestamp | Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDateVientiane(value: Timestamp | Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  return `${day}/${month}/${year}`;
}

export function formatDateTimeVientiane(value: Timestamp | Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  const dateStr = formatDateVientiane(date);
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  return `${dateStr} ${timeStr}`;
}
