import { DEFAULT_ACCENT } from './accents';
import type { Diary } from './diary';
import { PROFILE_FORMAT, PROFILE_VERSION } from '../format/profile-check';
import { lang, t } from '../i18n/lang';

/*
 * «почати без ШІ» (brief, Decisions 2026-11-08): every section filled with
 * examples under neutral names, settings only, no invented log. A light
 * example (Olesia, 2026-11-09): two morning levels, one daytime zone, one
 * workout, one kind of movement, one evening question, 2–3 exercises in
 * each. Texts are Нитка's draft. Format: PROFILE-FORMAT.md, 0.1; a test
 * checks it against the schema.
 */

const exercise = (n: number) => ({
  id: `exercise-${n}`,
  name: `${t('вправа')} ${n}`,
  how: t('тут буде коротко, як її робити.'),
  source: { type: 'user' },
});

const EXAMPLE_PROFILE = {
  format: PROFILE_FORMAT,
  version: PROFILE_VERSION,
  lang: lang(),
  theme: { accent: DEFAULT_ACCENT },
  // `any` changes nothing with one section; a second one ticked in the settings finds «будь-яка активність» on (Olesia, 2026-11-19)
  goal: { enabled: true, days: 5, done: ['morningWarmup'], any: true },
  encouragement: [t('ти можеш налаштувати все в налаштуваннях :)')],
  morningWarmup: {
    enabled: true,
    weeklyTarget: 5,
    levels: [
      { id: 'level-1', name: t('рівень 1'), duration: t('5 хв'), items: [{ exercise: 'exercise-1', reps: '10' }, { exercise: 'exercise-2', seconds: 30 }] },
      // F-07: the same exercises again, but as the level's own (own ids), so a tick in one level never ticks the other
      { id: 'level-2', name: t('рівень 2'), duration: t('10 хв'), items: [
        { exercise: 'exercise-9', reps: '15' }, { exercise: 'exercise-10', seconds: 45 }, { exercise: 'exercise-3', reps: '10' },
      ] },
    ],
  },
  daytimeWarmup: {
    enabled: true,
    weeklyTarget: 3,
    hint: t('коли довго сидиш'),
    groups: [{ id: 'back', name: t('для спини'), items: [{ exercise: 'exercise-4', reps: '8' }, { exercise: 'exercise-5', seconds: 20 }] }],
  },
  workout: {
    enabled: true,
    weeklyTarget: 2,
    hint: t('через день'),
    sessions: [
      { id: 'a', name: t('а'), how: t('розімнися перед початком.'), items: [
        { exercise: 'exercise-6', reps: '10', weight: 5, sets: 3, fields: ['weight', 'reps'] },
        { exercise: 'exercise-7', reps: '12', sets: 2, fields: ['reps'] },
        { exercise: 'exercise-8', seconds: 30, fields: ['seconds'] },
      ] },
    ],
  },
  movement: {
    enabled: true,
    weeklyTarget: 3,
    kinds: [{ id: 'movement-1', name: t('рух 1'), fields: ['km', 'minutes'], source: { type: 'user' } }],
  },
  exercises: [...[1, 2, 3, 4, 5, 6, 7, 8].map(exercise), { ...exercise(1), id: 'exercise-9' }, { ...exercise(2), id: 'exercise-10' }],
  trackers: [
    { id: 'energy', name: t('енергія'), hint: t('0 — немає сил, 10 — повно сил'), kind: 'scale', min: 0, max: 10, ask: ['morning', 'afterWorkout'] },
    { id: 'pulse', name: t('пульс'), kind: 'number', units: [t('уд/хв')], ask: ['morning'], timer: { enabled: true, seconds: 30 } },
    { id: 'hard', name: t('було важко?'), kind: 'yesno', ask: ['afterWorkout'] },
    { id: 'tired', name: t('втома'), hint: t('0 — бадьоро, 10 — дуже втомлено'), kind: 'scale', min: 0, max: 10, ask: ['evening'] },
  ],
  // «почати без ШІ» shows what the app can do, food too (Olesia, 2026-11-23); for everyone else it stays off
  food: { enabled: true },
};

export const EXAMPLE_DIARY: Diary = { profile: EXAMPLE_PROFILE, days: {} };
