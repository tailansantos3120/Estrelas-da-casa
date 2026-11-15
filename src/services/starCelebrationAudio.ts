import { ROTATION_ORDER } from '../shared/schedule.ts';
import type { ChatReactionMap, GameState, ParticipantId, SoundThemeId } from '../shared/types.ts';

const SOUND_PREF_KEY = 'estrelas_sound_enabled';
const SOUND_THEME_KEY_PREFIX = 'estrelas_sound_theme_';

export interface SoundThemeInfo {
  id: SoundThemeId;
  name: string;
  emoji: string;
  subtitle: string;
  badge: string;
}

export const SOUND_THEMES: SoundThemeInfo[] = [
  {
    id: 'classico',
    name: 'Clássico Estelar',
    emoji: '⭐',
    subtitle: 'Arpejo Dó maior brilhante e festivo',
    badge: 'Padrão',
  },
  {
    id: 'cristal',
    name: 'Cristal Luxo',
    emoji: '💎',
    subtitle: 'Sinos agudos e cintilantes em Lá maior',
    badge: 'Agudo',
  },
  {
    id: 'arcade',
    name: 'Game / Arcade',
    emoji: '🕹️',
    subtitle: 'Toque retrô 8-bit estilo videogame',
    badge: '8-bit',
  },
  {
    id: 'marimba',
    name: 'Marimba Tropical',
    emoji: '🌴',
    subtitle: 'Percussão leve pentatônica em Sol',
    badge: 'Suave+',
  },
  {
    id: 'festa',
    name: 'Fanfarra VIP',
    emoji: '🎺',
    subtitle: 'Acorde encorpado de celebração máxima',
    badge: 'Intenso',
  },
  {
    id: 'suave',
    name: 'Zen Suave',
    emoji: '🌙',
    subtitle: 'Notas puras macias e relaxantes',
    badge: 'Discreto',
  },
];

let activeSoundTheme: SoundThemeId = 'classico';
let audioCtx: AudioContext | null = null;
let unlockListenersAttached = false;
const lastPlayedByKind = new Map<string, number>();

export type GameSoundKind =
  | 'star'
  | 'task'
  | 'reaction'
  | 'reaction_remote'
  | 'chat_send'
  | 'chat_receive'
  | 'dice_roll'
  | 'power'
  | 'penalty'
  | 'rank_climb'
  | 'confirm'
  | 'error';

function shouldThrottleSound(kind: string, minIntervalMs = 55): boolean {
  const now = Date.now();
  const prev = lastPlayedByKind.get(kind) ?? 0;
  if (now - prev < minIntervalMs) return true;
  lastPlayedByKind.set(kind, now);
  return false;
}

function isValidTheme(theme: unknown): theme is SoundThemeId {
  return SOUND_THEMES.some((t) => t.id === theme);
}

export function getSoundThemeMeta(themeId?: SoundThemeId | null): SoundThemeInfo {
  return SOUND_THEMES.find((t) => t.id === themeId) || SOUND_THEMES[0];
}

export function getActiveSoundTheme(participantId?: ParticipantId): SoundThemeId {
  if (participantId && typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(`${SOUND_THEME_KEY_PREFIX}${participantId}`);
      if (isValidTheme(saved)) return saved;
    } catch {
      // ignore storage errors
    }
  }
  return activeSoundTheme;
}

export function setActiveSoundTheme(
  themeId: SoundThemeId | undefined,
  participantId?: ParticipantId
): SoundThemeId {
  const resolved: SoundThemeId = isValidTheme(themeId) ? themeId : 'classico';
  activeSoundTheme = resolved;
  if (participantId && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${SOUND_THEME_KEY_PREFIX}${participantId}`, resolved);
    } catch {
      // ignore storage errors
    }
  }
  return resolved;
}

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext || w.webkitAudioContext || null;
}

function getOrCreateAudioContext(): AudioContext | null {
  const Ctor = getAudioContextClass();
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function isSoundEffectsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function setSoundEffectsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function unlockCelebrationAudio(): void {
  if (typeof window === 'undefined') return;
  const ctx = getOrCreateAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      // ignore if browser requires a fresh gesture
    });
  }
}

export function ensureAudioUnlockListeners(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;
  const onFirstGesture = () => {
    unlockCelebrationAudio();
  };
  window.addEventListener('pointerdown', onFirstGesture, { passive: true });
  window.addEventListener('keydown', onFirstGesture, { passive: true });
}

/**
 * Computes positive star gain across participants between two GameState snapshots.
 */
export function computeTotalStarGain(
  prevStars: Record<ParticipantId, number> | null,
  nextState: GameState
): { totalGain: number; maxSingleGain: number; earners: ParticipantId[] } {
  if (!prevStars) {
    return { totalGain: 0, maxSingleGain: 0, earners: [] };
  }
  let totalGain = 0;
  let maxSingleGain = 0;
  const earners: ParticipantId[] = [];
  for (const pid of ROTATION_ORDER) {
    const prev = prevStars[pid];
    const next = nextState.participants?.[pid]?.stars;
    if (typeof prev === 'number' && typeof next === 'number' && next > prev) {
      const diff = next - prev;
      totalGain += diff;
      if (diff > maxSingleGain) maxSingleGain = diff;
      earners.push(pid);
    }
  }
  return { totalGain, maxSingleGain, earners };
}

/**
 * Computes star losses across participants between two GameState snapshots.
 */
export function computeTotalStarLoss(
  prevStars: Record<ParticipantId, number> | null,
  nextState: GameState
): { totalLoss: number; losers: ParticipantId[] } {
  if (!prevStars) {
    return { totalLoss: 0, losers: [] };
  }
  let totalLoss = 0;
  const losers: ParticipantId[] = [];
  for (const pid of ROTATION_ORDER) {
    const prev = prevStars[pid];
    const next = nextState.participants?.[pid]?.stars;
    if (typeof prev === 'number' && typeof next === 'number' && next < prev) {
      totalLoss += prev - next;
      losers.push(pid);
    }
  }
  return { totalLoss, losers };
}

function sumReactionMap(map?: ChatReactionMap): number {
  if (!map) return 0;
  let total = 0;
  for (const list of Object.values(map)) {
    if (Array.isArray(list)) total += list.length;
  }
  return total;
}

/**
 * Counts total emoji reactions across chat messages, notifications, and participant cards.
 */
export function countTotalReactions(state: GameState): number {
  let count = 0;
  for (const msg of state.chatMessages || []) {
    count += sumReactionMap(msg.reactions);
  }
  for (const notif of state.notifications || []) {
    count += sumReactionMap(notif.reactions);
  }
  for (const pid of ROTATION_ORDER) {
    count += sumReactionMap(state.participants?.[pid]?.reactions);
  }
  return count;
}

export function extractStarsMap(state: GameState): Record<ParticipantId, number> {
  return {
    tailan: state.participants?.tailan?.stars ?? 0,
    carol: state.participants?.carol?.stars ?? 0,
    karine: state.participants?.karine?.stars ?? 0,
    caio: state.participants?.caio?.stars ?? 0,
  };
}

/**
 * Triggers mobile haptic vibration pattern synchronized with the festive chime.
 */
export function triggerStarHaptic(starDelta = 1): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    const pattern =
      starDelta >= 2
        ? [28, 32, 42, 32, 75, 40, 95]
        : [22, 28, 38, 28, 62];
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function triggerActionHaptic(kind: GameSoundKind): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  const patterns: Record<GameSoundKind, number[]> = {
    star: [22, 28, 38, 28, 62],
    task: [16, 22, 32],
    reaction: [14],
    reaction_remote: [10],
    chat_send: [16],
    chat_receive: [14, 24, 14],
    dice_roll: [14, 20, 14, 20, 30],
    power: [20, 24, 38],
    penalty: [45, 36, 65],
    rank_climb: [26, 24, 42, 24, 72],
    confirm: [12],
    error: [35, 30, 35],
  };
  try {
    return navigator.vibrate(patterns[kind]);
  } catch {
    return false;
  }
}

interface ToneStep {
  freq: number;
  freqEnd?: number;
  delaySec: number;
  durationSec: number;
  gain: number;
  type: OscillatorType;
}

interface ThemeAudioProfile {
  scale: [number, number, number, number, number]; // root, 3rd, 5th, 7th/6th, octave
  mainWave: OscillatorType;
  accentWave: OscillatorType;
  popRange: [number, number];
  chatNotes: [number, number];
  gainScale: number;
  tempoScale: number;
}

const THEME_PROFILES: Record<SoundThemeId, ThemeAudioProfile> = {
  classico: {
    scale: [523.25, 659.25, 783.99, 987.77, 1046.5], // C5 E5 G5 B5 C6
    mainWave: 'triangle',
    accentWave: 'sine',
    popRange: [500, 920],
    chatNotes: [659.25, 880.0],
    gainScale: 1.0,
    tempoScale: 1.0,
  },
  cristal: {
    scale: [880.0, 1108.73, 1318.51, 1661.22, 1760.0], // A5 C#6 E6 G#6 A6
    mainWave: 'sine',
    accentWave: 'sine',
    popRange: [780, 1320],
    chatNotes: [880.0, 1318.51],
    gainScale: 0.9,
    tempoScale: 0.92,
  },
  arcade: {
    scale: [587.33, 739.99, 880.0, 1046.5, 1174.66], // D5 F#5 A5 C6 D6
    mainWave: 'square',
    accentWave: 'triangle',
    popRange: [420, 1080],
    chatNotes: [587.33, 1174.66],
    gainScale: 0.58,
    tempoScale: 0.78,
  },
  marimba: {
    scale: [392.0, 493.88, 587.33, 659.25, 783.99], // G4 B4 D5 E5 G5
    mainWave: 'sine',
    accentWave: 'triangle',
    popRange: [390, 740],
    chatNotes: [587.33, 783.99],
    gainScale: 1.05,
    tempoScale: 0.95,
  },
  festa: {
    scale: [698.46, 880.0, 1046.5, 1318.51, 1396.91], // F5 A5 C6 E6 F6
    mainWave: 'sawtooth',
    accentWave: 'triangle',
    popRange: [560, 1120],
    chatNotes: [698.46, 1046.5],
    gainScale: 0.56,
    tempoScale: 0.9,
  },
  suave: {
    scale: [349.23, 440.0, 523.25, 659.25, 698.46], // F4 A4 C5 E5 F5
    mainWave: 'sine',
    accentWave: 'sine',
    popRange: [380, 620],
    chatNotes: [523.25, 659.25],
    gainScale: 0.85,
    tempoScale: 1.25,
  },
};

function scheduleToneSteps(
  ctx: AudioContext,
  steps: ToneStep[],
  masterVolume = 0.9,
  baseOffsetSec = 0.012
): void {
  const now = ctx.currentTime + baseOffsetSec;
  const master = ctx.createGain();
  master.gain.setValueAtTime(masterVolume, now);
  master.connect(ctx.destination);

  for (const step of steps) {
    const start = now + step.delaySec;
    const stop = start + step.durationSec;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = step.type;
    osc.frequency.setValueAtTime(step.freq, start);
    if (step.freqEnd && step.freqEnd !== step.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, step.freqEnd), stop);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(step.gain, start + Math.min(0.014, step.durationSec * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, stop);

    osc.connect(env);
    env.connect(master);

    osc.start(start);
    osc.stop(stop + 0.02);
  }
}

function runWithAudioContext(fn: (ctx: AudioContext) => void, ignoreMute = false): void {
  if (!ignoreMute && !isSoundEffectsEnabled()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(() => {
        fn(ctx);
      })
      .catch(() => {
        // Autoplay policy blocked without fresh user gesture
      });
  } else {
    fn(ctx);
  }
}

function getFestiveStarSteps(starDelta: number, theme: SoundThemeId): ToneStep[] {
  const p = THEME_PROFILES[theme] || THEME_PROFILES.classico;
  const [n1, n2, n3, n4, n5] = p.scale;
  const g = p.gainScale;
  const t = p.tempoScale;

  if (starDelta >= 2) {
    return [
      { freq: n1, delaySec: 0.0 * t, durationSec: 0.16 * t, gain: 0.14 * g, type: p.mainWave },
      { freq: n2, delaySec: 0.07 * t, durationSec: 0.16 * t, gain: 0.15 * g, type: p.mainWave },
      { freq: n3, delaySec: 0.14 * t, durationSec: 0.18 * t, gain: 0.16 * g, type: p.mainWave },
      { freq: n4, delaySec: 0.21 * t, durationSec: 0.2 * t, gain: 0.13 * g, type: p.mainWave },
      { freq: n5, delaySec: 0.28 * t, durationSec: 0.44 * t, gain: 0.18 * g, type: p.mainWave },
      { freq: n2 * 2, delaySec: 0.34 * t, durationSec: 0.42 * t, gain: 0.11 * g, type: p.accentWave },
      { freq: n3 * 2, delaySec: 0.39 * t, durationSec: 0.38 * t, gain: 0.09 * g, type: p.accentWave },
      { freq: n5 * 2, delaySec: 0.44 * t, durationSec: 0.35 * t, gain: 0.06 * g, type: 'sine' },
    ];
  }

  return [
    { freq: n1, delaySec: 0.0 * t, durationSec: 0.14 * t, gain: 0.13 * g, type: p.mainWave },
    { freq: n2, delaySec: 0.075 * t, durationSec: 0.15 * t, gain: 0.14 * g, type: p.mainWave },
    { freq: n3, delaySec: 0.15 * t, durationSec: 0.18 * t, gain: 0.15 * g, type: p.mainWave },
    { freq: n5, delaySec: 0.225 * t, durationSec: 0.36 * t, gain: 0.17 * g, type: p.mainWave },
    { freq: n3 * 2, delaySec: 0.26 * t, durationSec: 0.32 * t, gain: 0.08 * g, type: p.accentWave },
    { freq: n5 * 2, delaySec: 0.31 * t, durationSec: 0.28 * t, gain: 0.05 * g, type: 'sine' },
  ];
}

/**
 * Plays a preview of a specific sound theme regardless of mute setting so participants can audition ringtones.
 */
export function previewSoundTheme(themeId: SoundThemeId): void {
  triggerStarHaptic(2);
  unlockCelebrationAudio();
  runWithAudioContext((ctx) => {
    scheduleToneSteps(ctx, getFestiveStarSteps(2, themeId), 0.9);
  }, true);
}

/**
 * Plays the festive sound effect + haptic vibration whenever a participant earns star(s).
 */
export function playStarEarnedEffect(starDelta = 1): void {
  triggerStarHaptic(starDelta);
  if (shouldThrottleSound('star', 80)) return;
  const theme = activeSoundTheme;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(ctx, getFestiveStarSteps(starDelta, theme), 0.9);
  });
}

/**
 * Crisp tactile check-pop + harmonic lift whenever a task, routine, custom task, or punishment is concluded.
 */
export function playTaskCompleteEffect(): void {
  triggerActionHaptic('task');
  if (shouldThrottleSound('task', 80)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        {
          freq: p.scale[0],
          freqEnd: p.scale[2],
          delaySec: 0.0,
          durationSec: 0.08 * p.tempoScale,
          gain: 0.13 * p.gainScale,
          type: p.mainWave,
        },
        {
          freq: p.scale[2],
          freqEnd: p.scale[4],
          delaySec: 0.055 * p.tempoScale,
          durationSec: 0.14 * p.tempoScale,
          gain: 0.11 * p.gainScale,
          type: p.accentWave,
        },
      ],
      0.85
    );
  });
}

/**
 * Playful bubble pop sound + micro-haptic when adding or toggling an emoji reaction.
 */
export function playReactionEffect(isRemote = false): void {
  const kind: GameSoundKind = isRemote ? 'reaction_remote' : 'reaction';
  triggerActionHaptic(kind);
  if (shouldThrottleSound(kind, 90)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  const [fStart, fEnd] = p.popRange;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      isRemote
        ? [
            {
              freq: fStart * 1.12,
              freqEnd: fEnd * 0.95,
              delaySec: 0.0,
              durationSec: 0.08,
              gain: 0.075 * p.gainScale,
              type: p.accentWave,
            },
          ]
        : [
            {
              freq: fStart,
              freqEnd: fEnd,
              delaySec: 0.0,
              durationSec: 0.085,
              gain: 0.13 * p.gainScale,
              type: p.accentWave,
            },
            {
              freq: p.scale[4],
              delaySec: 0.04,
              durationSec: 0.09,
              gain: 0.06 * p.gainScale,
              type: p.mainWave,
            },
          ],
      0.85
    );
  });
}

/**
 * Upward airy swoosh-plink when sending a message or 1-tap reaction burst in Chat.
 */
export function playChatSendEffect(): void {
  triggerActionHaptic('chat_send');
  if (shouldThrottleSound('chat_send', 80)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        {
          freq: p.scale[0],
          freqEnd: p.scale[1],
          delaySec: 0.0,
          durationSec: 0.075,
          gain: 0.11 * p.gainScale,
          type: p.accentWave,
        },
        {
          freq: p.scale[2],
          freqEnd: p.scale[4],
          delaySec: 0.05,
          durationSec: 0.11,
          gain: 0.12 * p.gainScale,
          type: p.mainWave,
        },
      ],
      0.85
    );
  });
}

/**
 * Warm two-note ping when receiving a chat message from another house participant.
 */
export function playChatReceiveEffect(): void {
  triggerActionHaptic('chat_receive');
  if (shouldThrottleSound('chat_receive', 140)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        {
          freq: p.chatNotes[0],
          delaySec: 0.0,
          durationSec: 0.11 * p.tempoScale,
          gain: 0.09 * p.gainScale,
          type: p.accentWave,
        },
        {
          freq: p.chatNotes[1],
          delaySec: 0.075 * p.tempoScale,
          durationSec: 0.18 * p.tempoScale,
          gain: 0.1 * p.gainScale,
          type: p.mainWave,
        },
      ],
      0.8
    );
  });
}

/**
 * Playful percussive rattle + crystal landing tone for rolling the daily dice.
 */
export function playDiceRollEffect(): void {
  triggerActionHaptic('dice_roll');
  if (shouldThrottleSound('dice_roll', 120)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: 290, freqEnd: 210, delaySec: 0.0, durationSec: 0.04, gain: 0.11, type: 'triangle' },
        { freq: 370, freqEnd: 250, delaySec: 0.045, durationSec: 0.04, gain: 0.11, type: 'triangle' },
        { freq: 330, freqEnd: 220, delaySec: 0.09, durationSec: 0.04, gain: 0.11, type: 'triangle' },
        { freq: 440, freqEnd: 310, delaySec: 0.135, durationSec: 0.045, gain: 0.12, type: 'triangle' },
        { freq: p.scale[1], delaySec: 0.19, durationSec: 0.22, gain: 0.14 * p.gainScale, type: p.accentWave },
        { freq: p.scale[3], delaySec: 0.22, durationSec: 0.24, gain: 0.08 * p.gainScale, type: p.accentWave },
      ],
      0.88
    );
  });
}

/**
 * Mystical shimmering chord for Fantasma, Chefe, Escudo, Coringa, and Rescue actions.
 */
export function playPowerEffect(): void {
  triggerActionHaptic('power');
  if (shouldThrottleSound('power', 90)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: p.scale[0] * 0.75, delaySec: 0.0, durationSec: 0.18, gain: 0.11 * p.gainScale, type: p.mainWave },
        { freq: p.scale[1], delaySec: 0.045, durationSec: 0.2, gain: 0.12 * p.gainScale, type: p.accentWave },
        { freq: p.scale[2], delaySec: 0.09, durationSec: 0.26, gain: 0.12 * p.gainScale, type: p.accentWave },
        { freq: p.scale[4] * 1.25, delaySec: 0.13, durationSec: 0.3, gain: 0.07 * p.gainScale, type: 'sine' },
      ],
      0.85
    );
  });
}

/**
 * Recognizable soft descending two-tone drop for star penalties, giving up, or denunciations.
 */
export function playPenaltyEffect(): void {
  triggerActionHaptic('penalty');
  if (shouldThrottleSound('penalty', 120)) return;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: 329.63, freqEnd: 293.66, delaySec: 0.0, durationSec: 0.14, gain: 0.13, type: 'triangle' },
        { freq: 246.94, freqEnd: 196.0, delaySec: 0.12, durationSec: 0.24, gain: 0.14, type: 'triangle' },
      ],
      0.85
    );
  });
}

/**
 * Royal ascending fanfare when a participant overtakes another on the Ranking leaderboard.
 */
export function playRankClimbEffect(delayMs = 220): void {
  triggerActionHaptic('rank_climb');
  if (shouldThrottleSound('rank_climb', 250)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  const [n1, n2, n3, , n5] = p.scale;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: n1 * 1.12, delaySec: 0.0, durationSec: 0.14 * p.tempoScale, gain: 0.12 * p.gainScale, type: p.mainWave },
        { freq: n2 * 1.12, delaySec: 0.07 * p.tempoScale, durationSec: 0.14 * p.tempoScale, gain: 0.13 * p.gainScale, type: p.mainWave },
        { freq: n3 * 1.12, delaySec: 0.14 * p.tempoScale, durationSec: 0.16 * p.tempoScale, gain: 0.14 * p.gainScale, type: p.mainWave },
        { freq: n5 * 1.12, delaySec: 0.21 * p.tempoScale, durationSec: 0.42 * p.tempoScale, gain: 0.16 * p.gainScale, type: p.mainWave },
        { freq: n3 * 2.25, delaySec: 0.27 * p.tempoScale, durationSec: 0.36 * p.tempoScale, gain: 0.07 * p.gainScale, type: 'sine' },
      ],
      0.9,
      0.015 + Math.max(0, delayMs) / 1000
    );
  });
}

/**
 * Subtle clean confirmation blip for justifications, AI search results, and admin/profile saves.
 */
export function playConfirmEffect(): void {
  triggerActionHaptic('confirm');
  if (shouldThrottleSound('confirm', 80)) return;
  const p = THEME_PROFILES[activeSoundTheme] || THEME_PROFILES.classico;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: p.chatNotes[0], delaySec: 0.0, durationSec: 0.06, gain: 0.09 * p.gainScale, type: p.accentWave },
        { freq: p.chatNotes[1], delaySec: 0.045, durationSec: 0.1, gain: 0.1 * p.gainScale, type: p.accentWave },
      ],
      0.8
    );
  });
}

/**
 * Gentle low thud on validation or network error.
 */
export function playErrorEffect(): void {
  triggerActionHaptic('error');
  if (shouldThrottleSound('error', 150)) return;
  runWithAudioContext((ctx) => {
    scheduleToneSteps(
      ctx,
      [
        { freq: 196.0, freqEnd: 155.56, delaySec: 0.0, durationSec: 0.14, gain: 0.12, type: 'triangle' },
      ],
      0.8
    );
  });
}

/**
 * Dispatches the appropriate interactive sound + haptic effect for a game action type.
 */
export function playSoundForActionType(actionType: string): void {
  switch (actionType) {
    case 'complete_routine':
    case 'complete_task':
    case 'complete_custom_task':
    case 'complete_fantasma_task':
    case 'complete_punishment':
    case 'admin_complete_all_today_tasks':
      playTaskCompleteEffect();
      break;
    case 'toggle_chat_reaction':
    case 'toggle_notif_reaction':
    case 'toggle_participant_reaction':
      playReactionEffect(false);
      break;
    case 'send_chat_message':
      playChatSendEffect();
      break;
    case 'roll_dice':
      playDiceRollEffect();
      break;
    case 'resolve_dice':
    case 'use_power':
    case 'trigger_pending_fantasma':
    case 'save_pending_fantasma':
    case 'respond_fantasma':
    case 'respond_delegation':
    case 'draw_delegation_fallback':
    case 'respond_task_rescue':
      playPowerEffect();
      break;
    case 'give_up_task':
    case 'fail_rescue_step3':
    case 'submit_denunciation':
      playPenaltyEffect();
      break;
    case 'update_sound_theme':
      // Sound preview is played when selecting/previewing the ringtone directly
      break;
    default:
      playConfirmEffect();
      break;
  }
}
