// Ramadan mode helpers: finds the Ramadan date range from the built-in
// Egyptian occasions data, and fetches suhoor (Imsak) / iftar (Maghrib)
// times from the free Aladhan prayer-times API (method 5 = Egyptian General
// Authority of Survey) using the same location logic as the weather widget:
// the user's chosen weather city, otherwise العبور، القليوبية.

import {EGYPT_OCCASIONS} from '../data/egyptOccasions';
import {DEFAULT_CITY, searchCitiesClientSide} from './weatherClient';

export interface RamadanRange {
  startIso: string; // first day of Ramadan
  endIso: string; // last day of Ramadan (day before Eid al-Fitr)
  tentative: boolean;
}

const DAY_MS = 86_400_000;

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns the Ramadan range containing todayIso, or the next upcoming one.
export function getRamadanRange(todayIso: string): RamadanRange | null {
  const starts = EGYPT_OCCASIONS.filter((o) => o.name.startsWith('أول أيام شهر رمضان')).sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso),
  );
  const eidStarts = EGYPT_OCCASIONS.filter((o) => o.name.startsWith('عيد الفطر المبارك')).sort(
    (a, b) => a.dateIso.localeCompare(b.dateIso),
  );

  for (const start of starts) {
    const eid = eidStarts.find((e) => e.dateIso > start.dateIso);
    if (!eid) continue;
    const endIso = dateToIso(new Date(isoToDate(eid.dateIso).getTime() - DAY_MS));
    if (todayIso <= endIso) {
      return {startIso: start.dateIso, endIso, tentative: Boolean(start.tentative)};
    }
  }
  return null;
}

export function isInRamadan(dateIso: string, todayIso: string): boolean {
  const range = getRamadanRange(todayIso);
  return Boolean(range && dateIso >= range.startIso && dateIso <= range.endIso);
}

export function ramadanDayNumber(dateIso: string, range: RamadanRange): number {
  return Math.round((isoToDate(dateIso).getTime() - isoToDate(range.startIso).getTime()) / DAY_MS) + 1;
}

export function ramadanLength(range: RamadanRange): number {
  return Math.round((isoToDate(range.endIso).getTime() - isoToDate(range.startIso).getTime()) / DAY_MS) + 1;
}

export interface SuhoorIftar {
  suhoor: string; // HH:MM 24h
  iftar: string; // HH:MM 24h
  locationLabel: string;
}

const CACHE_PREFIX = 'omars_life_ramadan_times_';
const CITY_PREF_KEY = 'omars_life_weather_city';

async function resolveLocation(): Promise<{lat: number; lng: number; label: string}> {
  let city = '';
  try {
    city = (typeof localStorage !== 'undefined' && localStorage.getItem(CITY_PREF_KEY)?.trim()) || '';
  } catch {
    city = '';
  }
  if (city) {
    try {
      const hits = await searchCitiesClientSide(city);
      if (hits[0]) {
        return {lat: hits[0].lat, lng: hits[0].lng, label: hits[0].label};
      }
    } catch {
      // fall through to default city
    }
  }
  return {lat: DEFAULT_CITY.lat, lng: DEFAULT_CITY.lng, label: DEFAULT_CITY.label};
}

function cleanTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export async function fetchSuhoorIftar(dateIso: string): Promise<SuhoorIftar | null> {
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_PREFIX + dateIso) : null;
    if (cached) {
      const parsed = JSON.parse(cached) as SuhoorIftar;
      if (parsed && parsed.suhoor && parsed.iftar) return parsed;
    }
  } catch {
    // ignore cache errors
  }

  const loc = await resolveLocation();
  const [y, m, d] = dateIso.split('-');
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${loc.lat.toFixed(
    5,
  )}&longitude=${loc.lng.toFixed(5)}&method=5`;
  try {
    const res = await fetch(url, {cache: 'no-store'});
    if (!res.ok) return null;
    const data = (await res.json()) as {data?: {timings?: Record<string, unknown>}};
    const suhoor = cleanTime(data?.data?.timings?.Imsak);
    const iftar = cleanTime(data?.data?.timings?.Maghrib);
    if (!suhoor || !iftar) return null;
    const out: SuhoorIftar = {suhoor, iftar, locationLabel: loc.label};
    try {
      localStorage.setItem(CACHE_PREFIX + dateIso, JSON.stringify(out));
    } catch {
      // ignore cache errors
    }
    return out;
  } catch {
    return null;
  }
}
