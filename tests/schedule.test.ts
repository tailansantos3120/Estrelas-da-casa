import { describe, expect, it } from 'vitest';
import {
  buildCalendarDatabase,
  getNextInRotation,
  getScheduleForDate,
} from '../src/shared/schedule.ts';

describe('Continuous Calendar Scale Engine', () => {
  it('follows Tailan -> Carol -> Karine -> Caio rotation order', () => {
    expect(getNextInRotation('tailan')).toBe('carol');
    expect(getNextInRotation('carol')).toBe('karine');
    expect(getNextInRotation('karine')).toBe('caio');
    expect(getNextInRotation('caio')).toBe('tailan');
  });

  it('matches Week 1 Wednesday (11/11) and Thursday (12/11) exact assignments', () => {
    const wed = getScheduleForDate('2026-11-11');
    expect(wed.cafe_manha).toBe('karine');
    expect(wed.janta).toBe('tailan');
    expect(wed.passar_pano).toBe('carol');

    const thu = getScheduleForDate('2026-11-12');
    expect(thu.cafe_manha).toBe('caio');
    expect(thu.cafe_tarde).toBe('carol');
    expect(thu.varrer_manha).toBe('carol');
    expect(thu.varrer_tarde).toBe('caio');
    expect(thu.almoco).toBe('karine');
    expect(thu.janta).toBe('carol');
    expect(thu.fogao_almoco).toBe('karine');
    expect(thu.fogao_janta).toBe('caio');
    expect(thu.banheiro).toBe('caio');
    expect(thu.garrafas).toBe('tailan');
    expect(thu.roupa).toBe('carol');
    expect(thu.organizar).toBe('karine');
    expect(thu.passar_pano).toBeNull();
  });

  it('matches Week 2 exact assignments and continues continuously into Week 3+ through Dec 31', () => {
    const w2Wed = getScheduleForDate('2026-11-18');
    expect(w2Wed.cafe_manha).toBe('carol');
    expect(w2Wed.janta).toBe('caio');
    expect(w2Wed.fogao_almoco).toBe('carol');
    expect(w2Wed.passar_pano).toBeNull();

    const w2Thu = getScheduleForDate('2026-11-19');
    expect(w2Thu.passar_pano).toBe('carol');

    const w3Wed = getScheduleForDate('2026-11-25');
    // Day 13 (W2 Tue) cafe_manha was caio -> Day 14 (W3 Wed) advances to tailan
    expect(w3Wed.cafe_manha).toBe('tailan');
    expect(w3Wed.fogao_almoco).toBe('tailan');
    expect(w3Wed.passar_pano).toBe('tailan');

    const calendar = buildCalendarDatabase('2026-11-11', '2026-12-31');
    expect(calendar[0].dateStr).toBe('2026-11-11');
    expect(calendar[calendar.length - 1].dateStr).toBe('2026-12-31');
    expect(calendar.length).toBe(51);
  });
});
