import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  applyStarDelta,
  choosePunishmentDay,
  completeCustomTask,
  completeFantasmaDrawTask,
  completeRoutine,
  completeTask,
  completeWeekendPunishment,
  deleteChatMessage,
  drawDelegationFallback,
  editChatMessage,
  ensureDayRecord,
  failTaskRescueStep3,
  getTaskResponsibleParticipant,
  giveUpTask,
  isDiceDisabledForDate,
  isFrozenToday,
  processExpiredDeadlines,
  resolveDiceAction,
  respondToDelegation,
  respondToFantasmaDraw,
  respondToTaskRescue,
  rollDice,
  saveDiceJustification,
  savePendingFantasmaToInventory,
  sendChatMessage,
  submitDenunciation,
  submitJustification,
  syncAutomaticDayRollover,
  tailanClearChatOrMessage,
  tailanDeleteCustomRule,
  tailanDeleteCustomTask,
  tailanDeleteDenunciation,
  tailanDeleteFantasmaDraw,
  tailanDeleteJustification,
  tailanDeleteNotification,
  tailanDeleteWeekendPunishment,
  tailanPostAnnouncement,
  tailanSetDayDice,
  tailanSetDiceDisabledForDate,
  tailanSetManualDateLock,
  tailanSetParticipantFlags,
  tailanSetParticipantInventory,
  tailanSetParticipantStars,
  tailanUpdateDayRoutine,
  tailanUpdateDayTask,
  tailanUpdateGoalBanner,
  tailanUpdateParticipantProfile,
  tailanUpdateRoutineOverride,
  tailanUpdateTaskOverride,
  tailanUpdateWeekendPunishment,
  tailanUpsertCustomRule,
  tailanUpsertCustomTask,
  toggleChatReaction,
  toggleNotificationReaction,
  toggleParticipantReaction,
  triggerFantasmaDraw,
  updateParticipantAvatar,
  updateParticipantDisplayName,
  updateParticipantSoundTheme,
  useInventoryPower,
} from './src/shared/gameLogic.ts';
import { buildProjectZipBuffer } from './serverZip.ts';
import { filterCurrentDayNotifications } from './src/shared/notificationFilter.ts';
import {
  ALLOWED_CREDENTIALS,
  getBrazilClockHHMM,
  getBrazilDateStr,
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  getParticipantName,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from './src/shared/schedule.ts';
import { createInitialSeedState } from './src/shared/seedState.ts';
import type {
  CloudBackupSnapshot,
  GameState,
  NotificationPreferences,
  ParticipantId,
  PowerType,
  RoutineId,
  SoundThemeId,
  TaskId,
} from './src/shared/types.ts';

interface AuthCredentialsRecord {
  passwordHash?: string;
  passwordSalt?: string;
  biometricToken?: string;
  biometricTokens?: string[];
  sessionTokens: string[];
}

interface PersistedDatabase {
  gameState: GameState;
  credentials: Record<ParticipantId, AuthCredentialsRecord>;
  backups: Array<{ snapshot: CloudBackupSnapshot; state: GameState }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'estrelas-db.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'estrelas-db.backup.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createInitialPersistedDb(): PersistedDatabase {
  return {
    gameState: createInitialSeedState(),
    credentials: {
      tailan: { sessionTokens: [] },
      carol: { sessionTokens: [] },
      karine: { sessionTokens: [] },
      caio: { sessionTokens: [] },
    },
    backups: [],
  };
}

function writeAtomicJsonFile(targetPath: string, content: string) {
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, targetPath);
}

function saveDatabase(db: PersistedDatabase) {
  ensureDataDir();
  const serialized = JSON.stringify(db, null, 2);
  writeAtomicJsonFile(DB_FILE, serialized);
  try {
    writeAtomicJsonFile(DB_BACKUP_FILE, serialized);
  } catch (err) {
    console.warn('Warning: failed to update rolling DB backup:', err);
  }
}

function normalizeLoadedDb(parsed: PersistedDatabase): { db: PersistedDatabase; dirty: boolean } {
  let dirty = false;
  const beforeLen = (parsed.gameState.notifications || []).length;
  parsed.gameState.notifications = filterCurrentDayNotifications(
    parsed.gameState.notifications || [],
    parsed.gameState.currentDateStr
  );
  if (parsed.gameState.notifications.length !== beforeLen) dirty = true;
  if (!Array.isArray(parsed.gameState.chatMessages)) {
    parsed.gameState.chatMessages = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.gameState.customTasks)) {
    parsed.gameState.customTasks = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.gameState.customRules)) {
    parsed.gameState.customRules = [];
    dirty = true;
  }
  if (!parsed.gameState.taskOverrides || typeof parsed.gameState.taskOverrides !== 'object') {
    parsed.gameState.taskOverrides = {};
    dirty = true;
  }
  if (!parsed.gameState.routineOverrides || typeof parsed.gameState.routineOverrides !== 'object') {
    parsed.gameState.routineOverrides = {};
    dirty = true;
  }
  if (!Array.isArray(parsed.gameState.diceDisabledDates)) {
    parsed.gameState.diceDisabledDates = [];
    dirty = true;
  }
  return { db: parsed, dirty };
}

function tryReadPersistedFile(filePath: string): PersistedDatabase | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as PersistedDatabase;
  if (!parsed?.gameState?.participants || !parsed?.credentials) {
    return null;
  }
  return parsed;
}

function loadDatabase(): PersistedDatabase {
  ensureDataDir();
  for (const candidatePath of [DB_FILE, DB_BACKUP_FILE]) {
    try {
      const parsed = tryReadPersistedFile(candidatePath);
      if (parsed) {
        const { db, dirty } = normalizeLoadedDb(parsed);
        if (dirty || candidatePath !== DB_FILE || !fs.existsSync(DB_BACKUP_FILE)) {
          saveDatabase(db);
        }
        return db;
      }
    } catch (err) {
      console.error(`Failed to read DB from ${candidatePath}:`, err);
    }
  }
  const initial = createInitialPersistedDb();
  saveDatabase(initial);
  return initial;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getEffectiveClockHHMM(state: GameState): string {
  if (state.simulatedClockTime) return state.simulatedClockTime;
  return getBrazilClockHHMM();
}

function parseHHMMToMinutes(hhmm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function subtractMinutesHHMM(hhmm: string, minutes: number): string {
  const total = parseHHMMToMinutes(hhmm);
  if (total === null) return hhmm;
  const next = Math.max(0, total - minutes);
  const nh = Math.floor(next / 60);
  const nm = next % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function resolveActionClockHHMM(state: GameState, rawClientHHMM: unknown): string {
  if (state.simulatedClockTime) return state.simulatedClockTime;
  const serverHHMM = getBrazilClockHHMM();
  if (typeof rawClientHHMM !== 'string') return serverHHMM;
  const clientMin = parseHHMMToMinutes(rawClientHHMM);
  const serverMin = parseHHMMToMinutes(serverHHMM);
  if (clientMin === null || serverMin === null) return serverHHMM;
  // Honor client tap time within a 3-minute tolerance for boundary latency/clock skew
  if (Math.abs(serverMin - clientMin) <= 3) {
    return rawClientHHMM;
  }
  return serverHHMM;
}

function findParticipantByName(state: GameState, name: string) {
  const cleanName = name.trim().toLowerCase();
  if (!cleanName) return undefined;
  return ALLOWED_CREDENTIALS.find((c) => {
    const currentName = getParticipantName(state, c.id).toLowerCase();
    return currentName === cleanName || c.name.toLowerCase() === cleanName;
  });
}

function findMatchingCredential(state: GameState, name: string, age: number) {
  const matchedByName = findParticipantByName(state, name);
  if (!matchedByName) return undefined;
  return matchedByName.age === Number(age) ? matchedByName : undefined;
}

export async function createAppServer() {
  const db = loadDatabase();
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'microphone=*');
    next();
  });
  app.use(express.json({ limit: '6mb' }));

  let distIndexMtime = '';
  try {
    const distHtml = path.resolve(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distHtml)) {
      distIndexMtime = String(Math.floor(fs.statSync(distHtml).mtimeMs));
    }
  } catch {
    // ignore
  }
  const SERVER_BOOT_VERSION = distIndexMtime
    ? `build-${distIndexMtime}`
    : `srv-${Date.now().toString(36)}`;

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  let stateRevision = 1;

  function ensureServerSyncedToToday(options?: { skipDeadlines?: boolean }): boolean {
    const rolled = syncAutomaticDayRollover(db.gameState, getBrazilDateStr());
    const deadlineClock = db.gameState.simulatedClockTime
      ? db.gameState.simulatedClockTime
      : subtractMinutesHHMM(getBrazilClockHHMM(), 1);
    const expiredChanged = options?.skipDeadlines
      ? false
      : processExpiredDeadlines(
          db.gameState,
          db.gameState.currentDateStr,
          deadlineClock
        );
    if (rolled || expiredChanged) {
      db.gameState.notifications = filterCurrentDayNotifications(
        db.gameState.notifications || [],
        db.gameState.currentDateStr
      );
      stateRevision += 1;
      saveDatabase(db);
    }
    return rolled || expiredChanged;
  }

  ensureServerSyncedToToday();

  function getPublicState(): GameState {
    const state = structuredClone(db.gameState);
    state.notifications = filterCurrentDayNotifications(
      state.notifications || [],
      state.currentDateStr
    );
    state.chatMessages = Array.isArray(state.chatMessages) ? state.chatMessages : [];
    state.customTasks = Array.isArray(state.customTasks) ? state.customTasks : [];
    state.customRules = Array.isArray(state.customRules) ? state.customRules : [];
    state.taskOverrides =
      state.taskOverrides && typeof state.taskOverrides === 'object' ? state.taskOverrides : {};
    state.routineOverrides =
      state.routineOverrides && typeof state.routineOverrides === 'object'
        ? state.routineOverrides
        : {};
    state.diceDisabledDates = Array.isArray(state.diceDisabledDates)
      ? state.diceDisabledDates
      : [];
    state.manualDateLocked = Boolean(state.manualDateLocked);
    for (const pid of ROTATION_ORDER) {
      state.participants[pid].hasPassword = Boolean(db.credentials[pid]?.passwordHash);
      state.participants[pid].hasBiometric = Boolean(
        db.credentials[pid]?.biometricToken ||
          (db.credentials[pid]?.biometricTokens && db.credentials[pid].biometricTokens!.length > 0)
      );
    }
    return state;
  }

  function broadcastUpdate(latestNotifId?: string, latestChatMsgId?: string) {
    const payload = JSON.stringify({
      type: 'state:update',
      state: getPublicState(),
      stateRevision,
      latestNotifId: latestNotifId || null,
      latestChatMsgId: latestChatMsgId || null,
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    ensureServerSyncedToToday();
    ws.send(JSON.stringify({ type: 'state:init', state: getPublicState(), stateRevision }));
  });

  // Automatic real-time midnight rollover + deadline watcher: settles closing day at 00:00 and triggers penalties/rescue draws
  const deadlineTimer = setInterval(() => {
    const state = db.gameState;
    const prevTopId = state.notifications[0]?.id;
    const rolled = syncAutomaticDayRollover(state, getBrazilDateStr());
    const deadlineClock = state.simulatedClockTime
      ? state.simulatedClockTime
      : subtractMinutesHHMM(getBrazilClockHHMM(), 1);
    const changed = processExpiredDeadlines(
      state,
      state.currentDateStr,
      deadlineClock
    );
    if (rolled || changed) {
      state.notifications = filterCurrentDayNotifications(
        state.notifications || [],
        state.currentDateStr
      );
      stateRevision += 1;
      saveDatabase(db);
      const nextTopId = state.notifications[0]?.id;
      broadcastUpdate(nextTopId !== prevTopId ? nextTopId : undefined);
    }
  }, 30000);
  if (typeof deadlineTimer.unref === 'function') {
    deadlineTimer.unref();
  }

  // Public endpoint returning working Game URL, App Install (PWA) URL, and per-participant links
  let sharedProbeCache: { url: string; live: boolean; checkedAt: number } | null = null;

  app.get('/api/app-links', async (req, res) => {
    const forceRefresh = req.query.refresh === '1';
    const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https')
      .split(',')[0]
      .trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const requestOrigin = host ? `${forwardedProto}://${host}` : '';

    const envUrlRaw = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    const validEnvUrl =
      envUrlRaw && envUrlRaw !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrlRaw)
        ? envUrlRaw
        : '';

    const savedPublicRaw = String(db.gameState.publicAppUrl || '').trim().replace(/\/+$/, '');
    const validSavedPublic =
      savedPublicRaw && /^https?:\/\//i.test(savedPublicRaw) && !/^(https?:\/\/)ais-dev-/i.test(savedPublicRaw)
        ? savedPublicRaw
        : '';

    const activeOrigin =
      validEnvUrl && (!requestOrigin || /localhost|127\.0\.0\.1/i.test(requestOrigin))
        ? validEnvUrl
        : requestOrigin || validEnvUrl;

    const isDevOrigin = /^(https?:\/\/)ais-dev-/i.test(activeOrigin);
    const candidateShared = isDevOrigin
      ? activeOrigin.replace(/^(https?:\/\/)ais-dev-/i, '$1ais-pre-')
      : null;

    let isSharedLive = Boolean(validSavedPublic) || !isDevOrigin;
    let pendingSharedUrl: string | null = null;

    if (!validSavedPublic && candidateShared) {
      const now = Date.now();
      if (
        !forceRefresh &&
        sharedProbeCache &&
        sharedProbeCache.url === candidateShared &&
        now - sharedProbeCache.checkedAt < 30000
      ) {
        isSharedLive = sharedProbeCache.live;
      } else {
        try {
          const probe = await fetch(candidateShared, {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(2200),
          });
          const loc = String(probe.headers.get('location') || '');
          const isCookieCheckRedirect =
            probe.status >= 300 &&
            probe.status < 400 &&
            loc.includes('__cookie_check') &&
            !/accounts\.google\.com|ServiceLogin/i.test(loc);
          isSharedLive = (probe.status >= 200 && probe.status < 300) || isCookieCheckRedirect;
        } catch {
          isSharedLive = false;
        }
        sharedProbeCache = { url: candidateShared, live: isSharedLive, checkedAt: now };
      }

      if (!isSharedLive) {
        pendingSharedUrl = candidateShared;
      }
    }

    // Shareable link for all participants must NEVER expose the private ais-dev- URL;
    // prefer savedPublicUrl, then candidateShared (ais-pre-), then activeOrigin.
    const gameUrl = (validSavedPublic || candidateShared || activeOrigin).replace(/\/+$/, '');
    const previewUrl = (requestOrigin || activeOrigin || gameUrl).replace(/\/+$/, '');
    const apkInstallUrl = gameUrl ? `${gameUrl}/?install=apk` : '';
    const apkBuilderUrl = gameUrl
      ? `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(gameUrl)}`
      : '';
    const manifestUrl = gameUrl ? `${gameUrl}/manifest.json` : '';
    const zipDownloadUrl = gameUrl ? `${gameUrl}/api/download-zip` : '/api/download-zip';

    return res.json({
      ok: true,
      gameUrl,
      previewUrl,
      apkInstallUrl,
      apkBuilderUrl,
      manifestUrl,
      zipDownloadUrl,
      isSharedLive,
      pendingSharedUrl,
      savedPublicUrl: validSavedPublic || null,
    });
  });

  app.get('/api/download-zip', (_req, res) => {
    try {
      const zipBuffer = buildProjectZipBuffer(process.cwd());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="estrelas-da-casa-app.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.setHeader('Cache-Control', 'no-store');
      return res.send(zipBuffer);
    } catch (err) {
      console.error('Failed to build project zip:', err);
      return res.status(500).json({ ok: false, error: 'Falha ao gerar arquivo .zip do projeto.' });
    }
  });

  // Search engine discovery (SEO): robots.txt & sitemap.xml
  const resolvePublicBaseUrl = (req: express.Request): string => {
    const saved = String(db.gameState.publicAppUrl || '').trim().replace(/\/+$/, '');
    if (saved && /^https?:\/\//i.test(saved) && !/^(https?:\/\/)ais-dev-/i.test(saved)) {
      return saved;
    }
    const envUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl && /^https?:\/\//i.test(envUrl)) {
      return envUrl.replace(/^(https?:\/\/)ais-dev-/i, '$1ais-pre-');
    }
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwardedHost || req.get('host') || '';
    const proto = forwardedProto || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
    return host ? `${proto}://${host}`.replace(/^(https?:\/\/)ais-dev-/i, '$1ais-pre-') : '';
  };

  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const lines = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      ...(baseUrl ? [`Sitemap: ${baseUrl}/sitemap.xml`] : []),
    ];
    res.type('text/plain; charset=utf-8').send(lines.join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req) || 'https://estrelas-da-casa.app';
    const lastMod = db.gameState.currentDateStr || new Date().toISOString().slice(0, 10);
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url>',
      `    <loc>${baseUrl}/</loc>`,
      `    <lastmod>${lastMod}</lastmod>`,
      '    <changefreq>daily</changefreq>',
      '    <priority>1.0</priority>',
      '  </url>',
      '  <url>',
      `    <loc>${baseUrl}/?install=apk</loc>`,
      `    <lastmod>${lastMod}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      '    <priority>0.9</priority>',
      '  </url>',
      '</urlset>',
    ].join('\n');
    res.type('application/xml; charset=utf-8').send(xml);
  });

  // Check participant status without revealing password
  app.get('/api/auth/status', (req, res) => {
    const name = String(req.query.name || '').trim();
    const matched = findParticipantByName(db.gameState, name);
    if (!matched) {
      return res.json({ validParticipant: false, hasPassword: false, hasBiometric: false });
    }
    const cred = db.credentials[matched.id];
    return res.json({
      validParticipant: true,
      participantId: matched.id,
      hasPassword: Boolean(cred?.passwordHash),
      hasBiometric: Boolean(
        cred?.biometricToken || (cred?.biometricTokens && cred.biometricTokens.length > 0)
      ),
    });
  });

  // Login or First-Time Password Creation (NO EMAIL!)
  app.post('/api/auth/login', (req, res) => {
    const { name, age, password } = req.body || {};
    if (!name || age === undefined || !password || String(password).length < 3) {
      return res.status(400).json({
        ok: false,
        error: 'Preencha Nome, Idade e uma Senha (mínimo 3 caracteres).',
      });
    }

    const matched = findMatchingCredential(db.gameState, String(name), Number(age));
    if (!matched) {
      const allowedText = ROTATION_ORDER.map(
        (id) => `${getParticipantName(db.gameState, id)} (${PARTICIPANT_PROFILES[id].age})`
      ).join(', ');
      return res.status(403).json({
        ok: false,
        error: `Acesso negado. Somente ${allowedText} podem entrar.`,
      });
    }

    const cred = db.credentials[matched.id];
    if (!cred.passwordHash) {
      // First access: owner creates personal password
      const salt = crypto.randomBytes(16).toString('hex');
      cred.passwordSalt = salt;
      cred.passwordHash = hashPassword(String(password), salt);
      db.gameState.participants[matched.id].hasPassword = true;
    } else {
      const candidateHash = hashPassword(String(password), cred.passwordSalt || '');
      if (candidateHash !== cred.passwordHash) {
        return res.status(401).json({
          ok: false,
          error: 'Senha incorreta. Sem a senha pessoal do dono, o painel fica bloqueado.',
        });
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    cred.sessionTokens = [token, ...cred.sessionTokens.slice(0, 24)];
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();

    return res.json({
      ok: true,
      participantId: matched.id,
      token,
      state: getPublicState(),
      stateRevision,
    });
  });

  app.post('/api/auth/verify', (req, res) => {
    const { participantId, token } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !token || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida ou expirada.' });
    }
    return res.json({ ok: true, participantId: pid });
  });

  app.post('/api/auth/biometric/register', (req, res) => {
    const { participantId, token } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    const bioToken = crypto.randomBytes(24).toString('hex');
    const prevTokens = Array.isArray(cred.biometricTokens)
      ? cred.biometricTokens
      : cred.biometricToken
      ? [cred.biometricToken]
      : [];
    cred.biometricToken = bioToken;
    cred.biometricTokens = [bioToken, ...prevTokens.slice(0, 4)];
    db.gameState.participants[pid].hasBiometric = true;
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();
    return res.json({ ok: true, biometricToken: bioToken, state: getPublicState(), stateRevision });
  });

  app.post('/api/auth/biometric/enroll', (req, res) => {
    const { participantId, name, age, password } = req.body || {};
    const numericAge = Number(age);
    const hasValidAge = age !== undefined && age !== '' && !Number.isNaN(numericAge);
    const matched = !hasValidAge
      ? undefined
      : participantId
      ? ALLOWED_CREDENTIALS.find((c) => c.id === participantId && c.age === numericAge)
      : findMatchingCredential(db.gameState, String(name || ''), numericAge);

    if (!matched) {
      const allowedText = ROTATION_ORDER.map(
        (id) => `${getParticipantName(db.gameState, id)} (${PARTICIPANT_PROFILES[id].age})`
      ).join(', ');
      return res.status(403).json({
        ok: false,
        error: `Dados inválidos. Confirme seu avatar e idade exata (${allowedText}).`,
      });
    }

    const cred = db.credentials[matched.id];
    if (cred.passwordHash) {
      if (!password || String(password).length < 3) {
        return res.status(401).json({
          ok: false,
          error: 'Informe sua senha pessoal para ativar a biometria pela 1ª vez neste aparelho.',
        });
      }
      const candidateHash = hashPassword(String(password), cred.passwordSalt || '');
      if (candidateHash !== cred.passwordHash) {
        return res.status(401).json({
          ok: false,
          error: 'Senha incorreta. Não foi possível ativar a biometria.',
        });
      }
    } else if (password && String(password).trim().length >= 3) {
      const salt = crypto.randomBytes(16).toString('hex');
      cred.passwordSalt = salt;
      cred.passwordHash = hashPassword(String(password), salt);
      db.gameState.participants[matched.id].hasPassword = true;
    }

    const bioToken = crypto.randomBytes(24).toString('hex');
    const token = crypto.randomBytes(24).toString('hex');
    const prevTokens = Array.isArray(cred.biometricTokens)
      ? cred.biometricTokens
      : cred.biometricToken
      ? [cred.biometricToken]
      : [];
    cred.biometricToken = bioToken;
    cred.biometricTokens = [bioToken, ...prevTokens.slice(0, 4)];
    cred.sessionTokens = [token, ...cred.sessionTokens.slice(0, 24)];
    db.gameState.participants[matched.id].hasBiometric = true;
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();

    return res.json({
      ok: true,
      participantId: matched.id,
      token,
      biometricToken: bioToken,
      state: getPublicState(),
      stateRevision,
    });
  });

  app.post('/api/auth/biometric/login', (req, res) => {
    const { participantId, biometricToken } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    const validTokens = [
      ...(cred?.biometricToken ? [cred.biometricToken] : []),
      ...(Array.isArray(cred?.biometricTokens) ? cred.biometricTokens : []),
    ];
    if (!cred || !biometricToken || !validTokens.includes(biometricToken)) {
      return res.status(401).json({ ok: false, error: 'Biometria não reconhecida.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    cred.sessionTokens = [token, ...cred.sessionTokens.slice(0, 24)];
    saveDatabase(db);
    return res.json({ ok: true, participantId: pid, token, state: getPublicState() });
  });

  app.delete('/api/auth/account', (req, res) => {
    const { participantId, token } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    db.credentials[pid] = { sessionTokens: [] };
    db.gameState.participants[pid].hasPassword = false;
    db.gameState.participants[pid].hasBiometric = false;
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();
    return res.json({ ok: true, state: getPublicState(), stateRevision });
  });

  app.get('/api/version', (_req, res) => {
    ensureServerSyncedToToday();
    return res.json({
      ok: true,
      version: SERVER_BOOT_VERSION,
      dateStr: db.gameState.currentDateStr,
    });
  });

  app.get('/api/state', (_req, res) => {
    ensureServerSyncedToToday();
    return res.json({ ok: true, state: getPublicState(), stateRevision, version: SERVER_BOOT_VERSION });
  });

  app.post('/api/action', (req, res) => {
    const { type, participantId, token, payload = {} } = req.body || {};
    const isCompletionOrResponse =
      type === 'complete_routine' ||
      type === 'complete_task' ||
      type === 'complete_custom_task' ||
      type === 'respond_task_rescue' ||
      type === 'respond_delegation';
    ensureServerSyncedToToday({ skipDeadlines: isCompletionOrResponse });

    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Autenticação necessária para esta ação.' });
    }

    const state = db.gameState;
    const dateStr = String(payload.dateStr || state.currentDateStr);
    const nowHHMM = resolveActionClockHHMM(state, payload.nowHHMM);
    const prevTopNotifId = state.notifications[0]?.id;
    const prevLastChatId = (state.chatMessages || [])[(state.chatMessages || []).length - 1]?.id;

    // Idempotent guard for automatic retries of already-persisted completions
    if (payload.isRetry) {
      const existingDay = state.days[dateStr];
      if (
        type === 'complete_routine' &&
        existingDay?.routines[pid]?.[payload.routineId as RoutineId]?.completed
      ) {
        return res.json({
          ok: true,
          alreadyCompleted: true,
          state: getPublicState(),
          stateRevision,
        });
      }
      if (
        type === 'complete_task' &&
        existingDay?.tasks[payload.taskId as TaskId]?.completedBy === pid
      ) {
        return res.json({
          ok: true,
          alreadyCompleted: true,
          state: getPublicState(),
          stateRevision,
        });
      }
      if (
        type === 'complete_custom_task' &&
        (state.customTasks || []).some(
          (ct) => ct.id === String(payload.customTaskId || '') && ct.completedBy === pid
        )
      ) {
        return res.json({
          ok: true,
          alreadyCompleted: true,
          state: getPublicState(),
          stateRevision,
        });
      }
    }

    let result: { ok: boolean; error?: string; [key: string]: unknown } = { ok: false, error: 'Ação desconhecida.' };

    switch (type) {
      case 'complete_routine':
        result = completeRoutine(state, dateStr, pid, payload.routineId as RoutineId, nowHHMM);
        break;
      case 'complete_task':
        result = completeTask(state, dateStr, pid, payload.taskId as TaskId, nowHHMM);
        break;
      case 'roll_dice':
        result = rollDice(
          state,
          state.currentDateStr,
          pid,
          payload.round as 1 | 2,
          getEffectiveClockHHMM(state),
          payload.forcedFace
        );
        break;
      case 'resolve_dice':
        result = resolveDiceAction(
          state,
          state.currentDateStr,
          pid,
          payload.round as 1 | 2,
          getEffectiveClockHHMM(state),
          payload
        );
        break;
      case 'use_power':
        result = useInventoryPower(state, dateStr, pid, payload.power as PowerType, nowHHMM, payload);
        break;
      case 'trigger_pending_fantasma': {
        const day = ensureDayRecord(state, dateStr);
        const queue = day.pendingFantasmaQueue[pid];
        const round = queue[0]?.round || 2;
        result = triggerFantasmaDraw(state, dateStr, pid, payload.taskId as TaskId, round, nowHHMM);
        break;
      }
      case 'save_pending_fantasma':
        result = savePendingFantasmaToInventory(state, dateStr, pid, nowHHMM);
        break;
      case 'update_display_name':
        result = updateParticipantDisplayName(state, pid, String(payload.name || ''), nowHHMM);
        break;
      case 'update_avatar':
        result = updateParticipantAvatar(
          state,
          pid,
          payload.avatarUrl == null ? null : String(payload.avatarUrl),
          nowHHMM
        );
        break;
      case 'respond_fantasma':
        result = respondToFantasmaDraw(state, String(payload.drawId), pid, Boolean(payload.accept), nowHHMM);
        break;
      case 'complete_fantasma_task':
        result = completeFantasmaDrawTask(state, String(payload.drawId), pid, nowHHMM);
        break;
      case 'respond_delegation':
        result = respondToDelegation(
          state,
          dateStr,
          payload.taskId as TaskId,
          pid,
          Boolean(payload.accept),
          nowHHMM
        );
        break;
      case 'draw_delegation_fallback':
        result = drawDelegationFallback(
          state,
          dateStr,
          payload.taskId as TaskId,
          pid,
          nowHHMM
        );
        break;
      case 'respond_task_rescue':
        result = respondToTaskRescue(
          state,
          dateStr,
          payload.taskId as TaskId,
          pid,
          Boolean(payload.accept),
          nowHHMM
        );
        break;
      case 'fail_rescue_step3':
        result = failTaskRescueStep3(state, dateStr, payload.taskId as TaskId, pid, nowHHMM);
        break;
      case 'give_up_task':
        result = giveUpTask(state, dateStr, payload.taskId as TaskId, pid, nowHHMM);
        break;
      case 'submit_justification':
        result = submitJustification(
          state,
          dateStr,
          pid,
          payload.reason,
          String(payload.details || ''),
          nowHHMM,
          {
            routineIds: Array.isArray(payload.routineIds) ? payload.routineIds : undefined,
          }
        );
        break;
      case 'save_dice_justification':
        result = saveDiceJustification(
          state,
          dateStr,
          pid,
          String(payload.text || ''),
          nowHHMM
        );
        break;
      case 'submit_denunciation':
        result = submitDenunciation(
          state,
          dateStr,
          pid,
          payload.targetId as ParticipantId,
          payload.category,
          String(payload.itemId),
          String(payload.details || ''),
          nowHHMM
        );
        break;
      case 'choose_punishment_day':
        result = choosePunishmentDay(state, String(payload.punishmentId), pid, payload.chosenDay, nowHHMM);
        break;
      case 'complete_punishment':
        result = completeWeekendPunishment(state, String(payload.punishmentId), pid, nowHHMM);
        break;
      case 'send_chat_message':
        result = sendChatMessage(state, pid, String(payload.text || ''), nowHHMM, {
          replyToId: payload.replyToId ? String(payload.replyToId) : null,
          kind:
            payload.kind === 'audio'
              ? 'audio'
              : payload.kind === 'reaction_burst'
              ? 'reaction_burst'
              : 'text',
          audioUrl: typeof payload.audioUrl === 'string' ? payload.audioUrl : undefined,
          audioDurationSec:
            typeof payload.audioDurationSec === 'number' ? payload.audioDurationSec : undefined,
        });
        break;
      case 'toggle_chat_reaction':
        result = toggleChatReaction(
          state,
          String(payload.messageId || ''),
          pid,
          String(payload.emoji || '')
        );
        break;
      case 'delete_chat_message':
        result = deleteChatMessage(state, String(payload.messageId || ''), pid);
        break;
      case 'edit_chat_message':
        result = editChatMessage(
          state,
          String(payload.messageId || ''),
          pid,
          String(payload.text || ''),
          nowHHMM
        );
        break;
      case 'toggle_notif_reaction':
        result = toggleNotificationReaction(
          state,
          String(payload.notificationId || ''),
          pid,
          String(payload.emoji || '')
        );
        break;
      case 'toggle_participant_reaction':
        result = toggleParticipantReaction(
          state,
          payload.targetId as ParticipantId,
          pid,
          String(payload.emoji || '')
        );
        break;
      case 'complete_custom_task':
        result = completeCustomTask(
          state,
          dateStr,
          pid,
          String(payload.customTaskId || ''),
          nowHHMM
        );
        break;
      case 'tailan_set_stars':
        result = tailanSetParticipantStars(
          state,
          pid,
          payload.targetId as ParticipantId,
          Number(payload.stars),
          nowHHMM
        );
        break;
      case 'tailan_set_inventory':
        result = tailanSetParticipantInventory(
          state,
          pid,
          payload.targetId as ParticipantId,
          payload.power as PowerType,
          Number(payload.quantity)
        );
        break;
      case 'tailan_set_flags':
        result = tailanSetParticipantFlags(state, pid, payload.targetId as ParticipantId, {
          frozenToday:
            typeof payload.frozenToday === 'boolean' ? payload.frozenToday : undefined,
          shieldActiveToday:
            typeof payload.shieldActiveToday === 'boolean'
              ? payload.shieldActiveToday
              : undefined,
          resetDiceRound:
            payload.resetDiceRound === 1 || payload.resetDiceRound === 2
              ? payload.resetDiceRound
              : undefined,
        });
        break;
      case 'tailan_upsert_custom_task':
        result = tailanUpsertCustomTask(
          state,
          pid,
          {
            id: payload.id ? String(payload.id) : undefined,
            dateStr: payload.taskDateStr ? String(payload.taskDateStr) : dateStr,
            title: String(payload.title || ''),
            description: payload.description ? String(payload.description) : undefined,
            assignedTo: (payload.assignedTo as ParticipantId | 'all') || 'all',
            starReward: Number(payload.starReward || 1),
            deadlineHHMM: payload.deadlineHHMM ? String(payload.deadlineHHMM) : null,
          },
          nowHHMM
        );
        break;
      case 'tailan_delete_custom_task':
        result = tailanDeleteCustomTask(state, pid, String(payload.customTaskId || ''));
        break;
      case 'tailan_update_day_task':
        result = tailanUpdateDayTask(
          state,
          pid,
          dateStr,
          payload.taskId as TaskId,
          {
            assignedTo:
              payload.assignedTo !== undefined
                ? (payload.assignedTo as ParticipantId | null)
                : undefined,
            status: payload.status as 'pending' | 'completed' | 'canceled' | undefined,
            completedBy:
              payload.completedBy !== undefined
                ? (payload.completedBy as ParticipantId | null)
                : undefined,
          },
          nowHHMM
        );
        break;
      case 'tailan_update_day_routine':
        result = tailanUpdateDayRoutine(
          state,
          pid,
          dateStr,
          payload.targetId as ParticipantId,
          payload.routineId as RoutineId,
          (payload.status as 'pending' | 'completed' | 'missed') || 'pending',
          nowHHMM
        );
        break;
      case 'tailan_update_task_override':
        result = tailanUpdateTaskOverride(
          state,
          pid,
          payload.taskId as TaskId,
          payload.override as
            | {
                label?: string;
                weekdayLimit?: string | null;
                weekendLimit?: string | null;
                note?: string;
              }
            | null
        );
        break;
      case 'tailan_upsert_custom_rule':
        result = tailanUpsertCustomRule(
          state,
          pid,
          {
            id: payload.id ? String(payload.id) : undefined,
            title: String(payload.title || ''),
            description: String(payload.description || ''),
            category:
              (payload.category as 'geral' | 'tarefa' | 'dado' | 'punicao' | 'premio') ||
              'geral',
          },
          nowHHMM
        );
        break;
      case 'tailan_delete_custom_rule':
        result = tailanDeleteCustomRule(state, pid, String(payload.ruleId || ''));
        break;
      case 'tailan_update_goal':
        result = tailanUpdateGoalBanner(state, pid, String(payload.goalText || ''), nowHHMM);
        break;
      case 'tailan_set_public_url': {
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode definir o link público oficial.' };
          break;
        }
        const raw = String(payload.publicAppUrl || '').trim().replace(/\/+$/, '');
        if (!raw) {
          state.publicAppUrl = null;
          result = { ok: true };
          break;
        }
        if (!/^https?:\/\//i.test(raw)) {
          result = { ok: false, error: 'Informe um link completo começando com https://.' };
          break;
        }
        if (/^(https?:\/\/)ais-dev-/i.test(raw)) {
          result = {
            ok: false,
            error: 'Esse é o link privado de edição (ais-dev). Use o link de Share (ais-pre) ou Deploy.',
          };
          break;
        }
        state.publicAppUrl = raw;
        result = { ok: true };
        break;
      }
      case 'tailan_post_announcement':
        result = tailanPostAnnouncement(
          state,
          pid,
          String(payload.title || ''),
          String(payload.message || ''),
          nowHHMM,
          payload.bonusTargetId && Number(payload.bonusDelta || 0) !== 0
            ? {
                targetId: payload.bonusTargetId as ParticipantId,
                delta: Number(payload.bonusDelta),
              }
            : undefined
        );
        break;
      case 'tailan_delete_punishment':
        result = tailanDeleteWeekendPunishment(
          state,
          pid,
          String(payload.punishmentId || '')
        );
        break;
      case 'tailan_clear_chat':
        result = tailanClearChatOrMessage(
          state,
          pid,
          payload.messageId ? String(payload.messageId) : undefined
        );
        break;
      case 'tailan_set_manual_date_lock':
        result = tailanSetManualDateLock(state, pid, Boolean(payload.locked));
        break;
      case 'tailan_set_dice_disabled':
        result = tailanSetDiceDisabledForDate(
          state,
          pid,
          String(payload.targetDateStr || dateStr),
          Boolean(payload.disabled)
        );
        break;
      case 'tailan_set_day_dice':
        result = tailanSetDayDice(
          state,
          pid,
          String(payload.targetDateStr || dateStr),
          payload.targetId as ParticipantId,
          (payload.round === 2 ? 2 : 1) as 1 | 2,
          payload.face === null || payload.face === undefined
            ? null
            : (Number(payload.face) as 1 | 2 | 3 | 4 | 5 | 6),
          nowHHMM
        );
        break;
      case 'tailan_update_routine_override':
        result = tailanUpdateRoutineOverride(
          state,
          pid,
          payload.routineId as RoutineId,
          payload.override as
            | {
                label?: string;
                weekdayLimit?: string | null;
                weekendLimit?: string | null;
                note?: string;
              }
            | null
        );
        break;
      case 'tailan_update_participant_profile':
        result = tailanUpdateParticipantProfile(
          state,
          pid,
          payload.targetId as ParticipantId,
          {
            displayName:
              payload.displayName !== undefined
                ? (payload.displayName as string | null)
                : undefined,
            avatarUrl:
              payload.avatarUrl !== undefined
                ? (payload.avatarUrl as string | null)
                : undefined,
            soundTheme: payload.soundTheme as SoundThemeId | undefined,
          },
          nowHHMM
        );
        break;
      case 'tailan_reset_participant_auth': {
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode redefinir senha/biometria.' };
          break;
        }
        const target = payload.targetId as ParticipantId;
        if (!db.credentials[target] || !state.participants[target]) {
          result = { ok: false, error: 'Participante inválido.' };
          break;
        }
        db.credentials[target] = { sessionTokens: [] };
        state.participants[target].hasPassword = false;
        state.participants[target].hasBiometric = false;
        result = { ok: true };
        break;
      }
      case 'tailan_delete_notification':
        result = tailanDeleteNotification(
          state,
          pid,
          payload.notificationId ? String(payload.notificationId) : undefined
        );
        break;
      case 'tailan_delete_justification':
        result = tailanDeleteJustification(
          state,
          pid,
          String(payload.justificationId || '')
        );
        break;
      case 'tailan_delete_denunciation':
        result = tailanDeleteDenunciation(
          state,
          pid,
          String(payload.denunciationId || '')
        );
        break;
      case 'tailan_delete_fantasma_draw':
        result = tailanDeleteFantasmaDraw(state, pid, String(payload.drawId || ''));
        break;
      case 'tailan_update_punishment':
        result = tailanUpdateWeekendPunishment(
          state,
          pid,
          payload as {
            id?: string;
            dateStr?: string;
            punishedId?: ParticipantId;
            coveringForId?: ParticipantId;
            deciderId?: ParticipantId;
            taskId?: TaskId;
            chosenDay?: 'sabado' | 'domingo' | null;
            completed?: boolean;
          },
          nowHHMM
        );
        break;
      case 'update_notif_prefs': {
        const incomingPrefs = payload.preferences as Partial<NotificationPreferences>;
        state.participants[pid].notificationPreferences = {
          ...state.participants[pid].notificationPreferences,
          ...incomingPrefs,
        };
        result = { ok: true };
        break;
      }
      case 'update_sound_theme':
        result = updateParticipantSoundTheme(state, pid, String(payload.soundTheme || ''));
        break;
      case 'process_deadlines':
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode executar ações administrativas.' };
          break;
        }
        processExpiredDeadlines(state, dateStr, nowHHMM);
        result = { ok: true };
        break;
      case 'admin_set_clock':
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode alterar o horário simulado.' };
          break;
        }
        state.simulatedClockTime = payload.clockTime ? String(payload.clockTime) : null;
        processExpiredDeadlines(state, state.currentDateStr, getEffectiveClockHHMM(state));
        result = { ok: true };
        break;
      case 'admin_set_date':
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode alterar a data do jogo.' };
          break;
        }
        if (payload.newDateStr) {
          const nextDate = String(payload.newDateStr);
          state.currentDateStr = nextDate;
          state.manualDateLocked = nextDate !== getBrazilDateStr();
          ensureDayRecord(state, state.currentDateStr);
          state.notifications = filterCurrentDayNotifications(
            state.notifications || [],
            state.currentDateStr
          );
          processExpiredDeadlines(state, state.currentDateStr, getEffectiveClockHHMM(state));
        }
        result = { ok: true };
        break;
      case 'admin_adjust_stars': {
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode ajustar estrelas.' };
          break;
        }
        const target = payload.targetId as ParticipantId;
        const delta = Number(payload.delta || 0);
        if (state.participants[target]) {
          state.participants[target].stars += delta;
          result = { ok: true };
        }
        break;
      }
      case 'admin_complete_all_today_tasks': {
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode concluir todas as tarefas.' };
          break;
        }
        const day = ensureDayRecord(state, dateStr);
        for (const tDef of TASK_DEFINITIONS) {
          const st = day.tasks[tDef.id];
          if (st && !st.completedBy && !st.canceledByFantasma) {
            const owner = st.delegatedTo || st.assignedTo;
            if (owner) {
              st.completedBy = owner;
              st.completedAt = `${dateStr}T${nowHHMM}:00`;
              if (!isFrozenToday(state, owner, dateStr)) {
                applyStarDelta(state, owner, 1, dateStr, nowHHMM);
              }
            }
          }
        }
        result = { ok: true };
        break;
      }
      case 'admin_reset_seed': {
        if (pid !== 'tailan') {
          result = { ok: false, error: 'Apenas Tailan pode restaurar o estado inicial.' };
          break;
        }
        const preservedNames = Object.fromEntries(
          ROTATION_ORDER.map((k) => [k, db.gameState.participants[k]?.displayName])
        ) as Record<ParticipantId, string | undefined>;
        const preservedAvatars = Object.fromEntries(
          ROTATION_ORDER.map((k) => [k, db.gameState.participants[k]?.avatarUrl])
        ) as Record<ParticipantId, string | undefined>;
        db.gameState = createInitialSeedState();
        for (const k of ROTATION_ORDER) {
          db.gameState.participants[k].hasPassword = Boolean(db.credentials[k]?.passwordHash);
          db.gameState.participants[k].hasBiometric = Boolean(
            db.credentials[k]?.biometricToken ||
              (db.credentials[k]?.biometricTokens && db.credentials[k].biometricTokens!.length > 0)
          );
          if (preservedNames[k]) {
            db.gameState.participants[k].displayName = preservedNames[k];
          }
          if (preservedAvatars[k]) {
            db.gameState.participants[k].avatarUrl = preservedAvatars[k];
          }
        }
        result = { ok: true };
        break;
      }
      default:
        result = { ok: false, error: `Ação desconhecida: ${type}` };
    }

    if (!result.ok) {
      return res.status(400).json({ ...result, state: getPublicState(), stateRevision });
    }

    db.gameState.notifications = filterCurrentDayNotifications(
      db.gameState.notifications || [],
      db.gameState.currentDateStr
    );
    stateRevision += 1;
    saveDatabase(db);
    const newTopNotifId = db.gameState.notifications[0]?.id;
    const newLastChatId = (db.gameState.chatMessages || [])[
      (db.gameState.chatMessages || []).length - 1
    ]?.id;
    broadcastUpdate(
      newTopNotifId !== prevTopNotifId ? newTopNotifId : undefined,
      newLastChatId && newLastChatId !== prevLastChatId ? newLastChatId : undefined
    );
    return res.json({ ...result, state: getPublicState(), stateRevision });
  });

  // Cloud Backup & Restore Endpoints
  app.get('/api/backups', (_req, res) => {
    return res.json({
      ok: true,
      backups: db.backups.map((b) => b.snapshot),
    });
  });

  app.post('/api/backups', (req, res) => {
    const { participantId, token, label } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    const snapshot: CloudBackupSnapshot = {
      id: `bkp-${Date.now()}`,
      label: String(label || `Backup ${getParticipantName(db.gameState, pid)}`),
      createdAt: new Date().toISOString(),
      createdBy: pid,
      starSummary: {
        tailan: db.gameState.participants.tailan.stars,
        carol: db.gameState.participants.carol.stars,
        karine: db.gameState.participants.karine.stars,
        caio: db.gameState.participants.caio.stars,
      },
    };
    db.backups.unshift({ snapshot, state: structuredClone(db.gameState) });
    db.backups = db.backups.slice(0, 20);
    saveDatabase(db);
    return res.json({ ok: true, snapshot, backups: db.backups.map((b) => b.snapshot) });
  });

  app.post('/api/backups/:id/restore', (req, res) => {
    const { participantId, token } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    const found = db.backups.find((b) => b.snapshot.id === req.params.id);
    if (!found) return res.status(404).json({ ok: false, error: 'Backup não encontrado.' });
    db.gameState = structuredClone(found.state);
    db.gameState.notifications = filterCurrentDayNotifications(
      db.gameState.notifications || [],
      db.gameState.currentDateStr
    );
    db.gameState.chatMessages = Array.isArray(db.gameState.chatMessages)
      ? db.gameState.chatMessages
      : [];
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();
    return res.json({ ok: true, state: getPublicState(), stateRevision });
  });

  app.post('/api/backups/import', (req, res) => {
    const { participantId, token, importedState } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida.' });
    }
    if (!importedState?.participants?.tailan || !importedState?.days) {
      return res.status(400).json({ ok: false, error: 'Arquivo de backup inválido.' });
    }
    db.gameState = importedState as GameState;
    db.gameState.notifications = filterCurrentDayNotifications(
      db.gameState.notifications || [],
      db.gameState.currentDateStr
    );
    db.gameState.chatMessages = Array.isArray(db.gameState.chatMessages)
      ? db.gameState.chatMessages
      : [];
    stateRevision += 1;
    saveDatabase(db);
    broadcastUpdate();
    return res.json({ ok: true, state: getPublicState(), stateRevision });
  });

  // Server-side Meta AI Search & Chat Endpoints (Gemini + smart Search grounding — strictly ephemeral, zero persistence)
  let searchGroundingCooldownUntil = 0;
  let cachedAiClient: { apiKey: string; client: GoogleGenAI } | null = null;

  function getGeminiClient(apiKey: string): GoogleGenAI {
    if (!cachedAiClient || cachedAiClient.apiKey !== apiKey) {
      cachedAiClient = {
        apiKey,
        client: new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        }),
      };
    }
    return cachedAiClient.client;
  }

  function normalizeTextForAi(q: string): string {
    return q
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function isInGameQuestion(q: string): boolean {
    const normalized = normalizeTextForAi(q);
    return /\b(jogo|estrela|estrelas|ranking|placar|ganhando|lider|liderando|tarefa|tarefas|rotina|rotinas|dado|fantasma|chefe|escudo|coringa|punicao|punicoes|punido|denuncia|regra|regras|tailan|carol|karine|caio|premio|meta|escala|vasilha|fogao|almoco|janta|cafe)\b/.test(
      normalized
    );
  }

  function needsRealtimeWebSearch(q: string): boolean {
    const normalized = normalizeTextForAi(q);
    return /\b(clima|previsao|tempo hoje|chover|temperatura|dolar|euro|cotacao|bitcoin|cripto|ibovespa|noticia|noticias|manchete|placar|resultado do jogo|campeonato|brasileirao|futebol|flamengo|corinthians|palmeiras|selecao|preco hoje|valor atual|pesquise na internet|pesquisa na internet|busca no google|busque no google|ultimas|lancamento 2026|2026)\b/.test(
      normalized
    );
  }

  function formatGeminiErrorPtBr(err: unknown): { status: number; message: string } {
    const raw = err instanceof Error ? err.message : String(err || '');
    const lower = raw.toLowerCase();
    if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
      return {
        status: 429,
        message:
          'A cota momentânea da IA (Gemini) foi atingida. Aguarde alguns segundos e tente novamente, ou verifique a chave em Settings > Secrets.',
      };
    }
    if (
      lower.includes('403') ||
      lower.includes('permission_denied') ||
      lower.includes('api_key_invalid') ||
      lower.includes('api key not valid')
    ) {
      return {
        status: 403,
        message:
          'A chave GEMINI_API_KEY está inválida ou sem permissão. Verifique-a em Settings > Secrets.',
      };
    }
    if (lower.includes('404') || lower.includes('not_found')) {
      return {
        status: 502,
        message: 'Modelo de IA indisponível no momento. Tente novamente em instantes.',
      };
    }
    return {
      status: 502,
      message: 'Não foi possível consultar a Inteligência Artificial agora. Tente novamente em instantes.',
    };
  }

  function tryInstantGameAnswer(
    state: GameState,
    pid: ParticipantId,
    cleanQuery: string,
    lang?: string
  ): string | null {
    if (lang && lang !== 'pt-BR') return null;
    const norm = normalizeTextForAi(cleanQuery);
    if (!norm || norm.length > 140) return null;

    // Defer open-ended / strategy / advice / comparison questions to Gemini
    const needsReasoning =
      /\b(melhor jogada|estrategia|dica|como ganhar|devo usar|vale a pena|conselho|analise|compare|por que|porque|receita|limpar|gordura|simule|calcule|previsao)\b/.test(
        norm
      );
    if (needsReasoning) return null;

    const asksRanking = /\b(ranking|placar|ganhando|lider|liderando|pontuacao|quantas estrelas|pontos)\b/.test(
      norm
    );
    const asksTodo = /\b(o que falta|falta eu fazer|minhas tarefas|minhas rotinas|pendente|pendentes|tenho que fazer|meu dia)\b/.test(
      norm
    );
    const asksPowerRules = /\b(regras|dado|fantasma|chefe|escudo|coringa|justific|justificativa)\b/.test(norm);
    const asksPunishment = /\b(punicao|punicoes|punido|sabado|domingo)\b/.test(norm);
    const asksApk = /\b(apk|instalar|aplicativo|app no celular|baixar app)\b/.test(norm);

    if (!asksRanking && !asksTodo && !asksPowerRules && !asksPunishment && !asksApk) {
      return null;
    }

    const day = ensureDayRecord(state, state.currentDateStr);
    const userName = getParticipantName(state, pid);
    const rankedOrder = [...ROTATION_ORDER].sort(
      (a, b) => state.participants[b].stars - state.participants[a].stars
    );
    const parts: string[] = [];

    if (asksRanking) {
      const leader = rankedOrder[0];
      const lines = rankedOrder.map((id, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '4º';
        return `${medal} ${getParticipantName(state, id)}: ${state.participants[id].stars} ⭐`;
      });
      parts.push(
        `🏆 ${getParticipantName(state, leader)} lidera hoje (${state.currentDateStr}):\n${lines.join('\n')}`
      );
    }

    if (asksTodo) {
      const pendingRoutines = ROUTINE_DEFINITIONS.map((b) =>
        getEffectiveRoutineDefinition(state, b.id)
      ).filter((rd) => {
        const entry = day.routines[pid]?.[rd.id];
        return entry && !entry.completed && !entry.justified && !entry.expiredPenaltyApplied;
      });
      const pendingTasks = TASK_DEFINITIONS.map((b) =>
        getEffectiveTaskDefinition(state, b.id)
      ).filter((td) => {
        const st = day.tasks[td.id];
        if (!st || st.completedBy || st.canceledByFantasma || st.justified || st.expiredPenaltyApplied) {
          return false;
        }
        return getTaskResponsibleParticipant(state, day, state.currentDateStr, td.id) === pid;
      });

      const rText =
        pendingRoutines.length > 0
          ? pendingRoutines.map((r) => r.label).join(', ')
          : 'Todas as rotinas de hoje já foram feitas ✅';
      const tText =
        pendingTasks.length > 0
          ? pendingTasks
              .map((td) => {
                const st = day.tasks[td.id];
                const isPun =
                  st?.assignedTo && st.assignedTo !== pid && !st.delegatedBy && !st.rescue;
                return isPun
                  ? `${td.label} (punição de ${getParticipantName(state, st.assignedTo!)})`
                  : td.label;
              })
              .join(', ')
          : 'Nenhuma tarefa pendente para você agora ✅';
      parts.push(`📋 Pendências de ${userName} hoje:\n• Rotinas: ${rText}\n• Tarefas: ${tText}`);
    }

    if (asksPunishment) {
      const activePun = (state.weekendPunishments || []).filter((wp) => !wp.completed);
      if (activePun.length > 0) {
        const punLines = activePun.map((wp) => {
          const pName = getParticipantName(state, wp.punishedId);
          const cName = getParticipantName(state, wp.coveringForId);
          const dayLbl =
            wp.chosenDay === 'sabado'
              ? 'Sábado'
              : wp.chosenDay === 'domingo'
              ? 'Domingo'
              : 'a definir';
          return `⚖️ ${pName} cumpre no ${dayLbl} (${wp.taskLabel} de ${wp.dateStr.split('-').reverse().join('/')}): faz as dele + todas as tarefas de ${cName} (+1 ⭐ automático para ${cName} em cada tarefa).`;
        });
        parts.push(punLines.join('\n'));
      } else {
        parts.push('⚖️ Nenhuma punição de fim de semana pendente no momento.');
      }
    }

    if (asksPowerRules && !asksRanking && !asksTodo) {
      const inv = state.participants[pid].inventory;
      parts.push(
        [
          '🎲 Resumo rápido do Dado, Poderes e Justificativas:',
          '• Dado (Manhã 05h–10h | Tarde 12h–19h): Manhã (1: -1⭐ | 2: nada | 3: +1⭐+Escudo | 4: +1⭐+Fantasma | 5: +1⭐+Chefe | 6: Coringa). Tarde (1: +4⭐ de alguém | 2: -3⭐ e +1⭐ pros outros | 3: +1⭐+Fantasma x2 | 4: +2⭐+congela dia | 5: +2⭐+Chefe x2 | 6: Coringa x2).',
          '• 👻 Fantasma: sorteia sua tarefa para outro participante fazer (+3 ⭐ se aceitar).',
          '• 👑 Chefe: delega sua tarefa diretamente para quem você escolher.',
          '• 🛡️ Escudo: protege contra perdas de estrelas.',
          '• 🃏 Coringa: escolha ativar Escudo, Fantasma ou Chefe.',
          '• 📝 Justificativas (0 ⭐): quem justificou não perde estrela e nem ganha (0 ⭐). Rotinas ficam em 0 ⭐ em qualquer motivo; tarefas ficam em 0 ⭐ e sem punição de fim de semana com "Tá doente" ou "Teve que sair".',
          `🎒 Seus itens (${userName}): 👻 ${inv.fantasma} · 🛡️ ${inv.escudo} · 👑 ${inv.chefe} · 🃏 ${inv.coringa}`,
        ].join('\n')
      );
    }

    if (asksApk) {
      parts.push(
        [
          '📲 Sistema APK · Aplicativo no Celular:',
          '• O Estrelas da Casa funciona como WebAPK / PWA instalável direto pelo navegador (ícone na tela inicial, tela cheia, biometria e tempo real).',
          '• Toque em "Link · APK" no topo da tela (ou na tela de login) para copiar o link APK ou clicar em "Instalar Aplicativo (WebAPK)".',
          '• Lá também há o atalho oficial do PWABuilder se quiser gerar um arquivo .apk Android tradicional.',
        ].join('\n')
      );
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  app.post('/api/ai/search', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    const { participantId, token, query, lang } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Autenticação necessária para usar a busca com IA.' });
    }

    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      return res.status(400).json({ ok: false, error: 'Digite algo para pesquisar.' });
    }
    if (cleanQuery.length > 500) {
      return res.status(400).json({ ok: false, error: 'Consulta muito longa (máximo 500 caracteres).' });
    }

    ensureServerSyncedToToday();
    const state = db.gameState;
    const instantAnswer = tryInstantGameAnswer(state, pid, cleanQuery, lang);
    if (instantAnswer) {
      return res.json({
        ok: true,
        answer: instantAnswer,
        sources: [],
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        ok: false,
        error: 'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets.',
      });
    }

    const inGameQuery = isInGameQuestion(cleanQuery);
    const {
      systemInstruction,
      rankedOrder,
      standingsSummary,
      todayTasksSummary,
      diceContext,
    } = buildAiContext(state, pid, lang, inGameQuery);

    const ai = getGeminiClient(apiKey);

    const shouldTrySearchGrounding =
      !inGameQuery &&
      needsRealtimeWebSearch(cleanQuery) &&
      Date.now() > searchGroundingCooldownUntil;

    let response;
    try {
      if (shouldTrySearchGrounding) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: cleanQuery,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              tools: [{ googleSearch: {} }],
              maxOutputTokens: 380,
            },
          });
        } catch (searchErr) {
          const errStr = searchErr instanceof Error ? searchErr.message : String(searchErr || '');
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
            searchGroundingCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn('Google Search grounding fallback to fast generation:', errStr.slice(0, 180));
        }
      }

      if (!response) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: cleanQuery,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              maxOutputTokens: 380,
            },
          });
        } catch (fastErr) {
          const errStr = fastErr instanceof Error ? fastErr.message : String(fastErr || '');
          const isTransient =
            errStr.includes('429') ||
            errStr.includes('503') ||
            errStr.includes('RESOURCE_EXHAUSTED') ||
            errStr.includes('UNAVAILABLE');
          if (!isTransient) throw fastErr;

          response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: cleanQuery,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              maxOutputTokens: 380,
            },
          });
        }
      }

      const answer = (response.text || '').trim();
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];
      for (const chunk of rawChunks) {
        const uri = chunk?.web?.uri;
        if (!uri || seenUris.has(uri)) continue;
        seenUris.add(uri);
        sources.push({
          title: chunk.web?.title || uri,
          uri,
        });
      }

      return res.json({
        ok: true,
        answer: answer || 'Não foi possível gerar uma resposta para essa pesquisa.',
        sources: sources.slice(0, 6),
      });
    } catch (err) {
      if (inGameQuery) {
        const leaderName = getParticipantName(state, rankedOrder[0]);
        const leaderStars = state.participants[rankedOrder[0]].stars;
        const fallbackSummary = [
          `📊 Resumo ao vivo do jogo (${state.currentDateStr} · ${getEffectiveClockHHMM(state)}):`,
          `🏆 Liderança atual: ${leaderName} com ${leaderStars}⭐.`,
          `⭐ Placar completo: ${standingsSummary}`,
          `📋 Tarefas de hoje: ${todayTasksSummary}`,
          `🎲 ${diceContext}`,
        ].join('\n\n');
        return res.json({
          ok: true,
          answer: fallbackSummary,
          sources: [],
        });
      }

      const formatted = formatGeminiErrorPtBr(err);
      return res.status(formatted.status).json({
        ok: false,
        error: formatted.message,
      });
    }
  });

  function buildAiContext(
    state: GameState,
    pid: ParticipantId,
    lang?: string,
    includeFullGameContext = true
  ) {
    const day = ensureDayRecord(state, state.currentDateStr);
    const rankedOrder = [...ROTATION_ORDER].sort(
      (a, b) => state.participants[b].stars - state.participants[a].stars
    );
    const standingsSummary = rankedOrder
      .map((id, idx) => {
        const p = state.participants[id];
        return `${idx + 1}º ${getParticipantName(state, id)}: ${p.stars}⭐ (👻${p.inventory.fantasma}, 🛡️${p.inventory.escudo}, 👑${p.inventory.chefe}, 🃏${p.inventory.coringa})`;
      })
      .join(' | ');

    const userName = getParticipantName(state, pid);
    const responseLanguage =
      lang === 'en' ? 'English' : lang === 'es' ? 'Spanish' : 'Brazilian Portuguese';

    if (!includeFullGameContext) {
      const compactInstruction = [
        `Você é a Meta AI do app Estrelas da Casa em conversa privada estilo WhatsApp com ${userName}.`,
        `Responda em ${responseLanguage} de forma MUITO RÁPIDA, curta, prática e direta ao ponto (máximo 4-6 linhas ou tópicos curtos, sem enrolação).`,
      ].join('\n');
      return {
        systemInstruction: compactInstruction,
        rankedOrder,
        standingsSummary,
        todayTasksSummary: '',
        diceContext: '',
      };
    }

    const todayTasksSummary = TASK_DEFINITIONS.map((baseTd) => {
      const td = getEffectiveTaskDefinition(state, baseTd.id);
      const st = day.tasks[td.id];
      const responsible = getTaskResponsibleParticipant(state, day, state.currentDateStr, td.id);
      const status = st?.completedBy
        ? `feita por ${getParticipantName(state, st.completedBy)}`
        : st?.canceledByFantasma
        ? 'cancelada por Fantasma'
        : st?.justified
        ? 'justificada'
        : st?.expiredPenaltyApplied
        ? 'perdida no prazo'
        : `pendente (${responsible ? getParticipantName(state, responsible) : 'livre'})`;
      return `${td.label}: ${status}`;
    }).join('; ');

    const userRoutinesSummary = ROUTINE_DEFINITIONS.map((baseRd) => {
      const rd = getEffectiveRoutineDefinition(state, baseRd.id);
      const rEntry = day.routines[pid]?.[rd.id];
      const status = rEntry?.completed
        ? 'feita'
        : rEntry?.justified
        ? 'justificada'
        : rEntry?.expiredPenaltyApplied
        ? 'perdida'
        : 'pendente';
      return `${rd.label}: ${status}`;
    }).join('; ');

    const diceDisabledToday = isDiceDisabledForDate(state, state.currentDateStr);
    const diceContext = diceDisabledToday
      ? 'Dado DESATIVADO hoje.'
      : 'Dado ativo: Manhã (R1 05h–10h) e Tarde (R2 12h–19h).';

    const activePunishments = (state.weekendPunishments || [])
      .filter((wp) => !wp.completed)
      .map(
        (wp) =>
          `${getParticipantName(state, wp.punishedId)} cobre tarefas de ${getParticipantName(state, wp.coveringForId)} no ${wp.chosenDay || 'a definir'} (origem: ${wp.taskLabel} ${wp.dateStr}, -3⭐)`
      )
      .join('; ');

    const customRulesContext =
      (state.customRules || []).length > 0
        ? `- Regras extras: ${(state.customRules || []).map((r) => `${r.title}: ${r.description}`).join(' | ')}`
        : '';
    const customTasksContext =
      (state.customTasks || []).length > 0
        ? `- Tarefas extras: ${(state.customTasks || []).map((t) => `${t.title} (+${t.starReward}⭐, ${t.completedBy ? 'feita' : 'pendente'})`).join(' | ')}`
        : '';

    const systemInstruction = [
      `Você é a Meta AI do jogo "Estrelas da Casa" em chat privado estilo WhatsApp com ${userName}.`,
      `Responda em ${responseLanguage} de forma MUITO RÁPIDA, objetiva e direta (tópicos curtos, sem textão).`,
      `Poderes: 👻 Fantasma (sorteia tarefa para outro), 🛡️ Escudo (protege estrelas), 👑 Chefe (delega tarefa), 🃏 Coringa (escolhe poder).`,
      `Justificativas: quem justificou não perde estrela e nem ganha (0 ⭐). Rotinas: 0 ⭐ em qualquer motivo; Tarefas: 0 ⭐ e sem punição de fds com "Tá doente" ou "Teve que sair".`,
      `Hoje (${state.currentDateStr}, ${getEffectiveClockHHMM(state)}):`,
      `- Placar: ${standingsSummary}`,
      `- Tarefas: ${todayTasksSummary}`,
      `- Rotinas de ${userName}: ${userRoutinesSummary}`,
      `- Dado: ${diceContext}`,
      activePunishments ? `- Punições ativas: ${activePunishments}` : '',
      customRulesContext,
      customTasksContext,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      systemInstruction,
      rankedOrder,
      standingsSummary,
      todayTasksSummary,
      diceContext,
    };
  }

  function formatAiChatHistory(history: unknown) {
    return Array.isArray(history)
      ? history
          .slice(-10)
          .filter(
            (item): item is { role: 'user' | 'model'; text: string } =>
              Boolean(item) &&
              (item.role === 'user' || item.role === 'model') &&
              typeof item.text === 'string' &&
              item.text.trim().length > 0
          )
          .map((item) => ({
            role: item.role,
            parts: [{ text: item.text.trim().slice(0, 1500) }],
          }))
      : [];
  }

  function extractGroundingSources(
    chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
    seenUris: Set<string>,
    sources: Array<{ title: string; uri: string }>
  ) {
    if (!chunks) return;
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (!uri || seenUris.has(uri)) continue;
      seenUris.add(uri);
      sources.push({
        title: chunk.web?.title || uri,
        uri,
      });
    }
  }

  function parseIncomingAudioPayload(
    rawAudio: unknown
  ): { mimeType: string; data: string } | null {
    if (!rawAudio || typeof rawAudio !== 'object') return null;
    const candidate = rawAudio as { mimeType?: unknown; data?: unknown };
    const rawData = typeof candidate.data === 'string' ? candidate.data.trim() : '';
    if (!rawData || rawData.length > 1_800_000) return null;
    const rawMime = typeof candidate.mimeType === 'string' ? candidate.mimeType.trim() : 'audio/webm';
    const baseMime = rawMime.split(';')[0].trim().toLowerCase();
    const safeMime =
      baseMime === 'video/webm'
        ? 'audio/webm'
        : baseMime === 'video/mp4'
        ? 'audio/mp4'
        : baseMime.startsWith('audio/')
        ? baseMime
        : 'audio/webm';
    return { mimeType: safeMime, data: rawData };
  }

  async function transcribeAudioWithGemini(
    ai: GoogleGenAI,
    audio: { mimeType: string; data: string }
  ): Promise<string> {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audio.mimeType,
              data: audio.data,
            },
          },
          {
            text: 'Transcreva fielmente em português o que foi falado neste áudio. Retorne apenas a transcrição.',
          },
        ],
      },
    });
    return (response.text || '').trim();
  }

  app.post('/api/ai/chat/stream', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    const { participantId, token, message, history, lang, audio } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Autenticação necessária para conversar com a Meta AI.' });
    }

    const parsedAudio = parseIncomingAudioPayload(audio);
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage && !parsedAudio) {
      return res.status(400).json({ ok: false, error: 'Digite uma mensagem ou grave um áudio para conversar com a Meta AI.' });
    }
    if (cleanMessage.length > 1500) {
      return res.status(400).json({ ok: false, error: 'Mensagem muito longa (máximo 1500 caracteres).' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        ok: false,
        error: 'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets.',
      });
    }

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    res.socket?.setNoDelay?.(true);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    if (!res.writableEnded) {
      res.write(': connected\n\n');
    }

    const writeEvent = (payload: Record<string, unknown>) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const ai = getGeminiClient(apiKey);
    let transcript = '';
    if (parsedAudio) {
      try {
        transcript = await transcribeAudioWithGemini(ai, parsedAudio);
        if (transcript) {
          writeEvent({ type: 'transcript', transcript });
        }
      } catch (transcribeErr) {
        const errStr = transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr || '');
        const lowerErr = errStr.toLowerCase();
        if (
          lowerErr.includes('403') ||
          lowerErr.includes('permission_denied') ||
          lowerErr.includes('api_key_invalid') ||
          lowerErr.includes('api key not valid')
        ) {
          const formatted = formatGeminiErrorPtBr(transcribeErr);
          writeEvent({ type: 'error', error: formatted.message, status: formatted.status });
          if (!res.writableEnded) res.end();
          return;
        }
        console.warn('Meta AI audio transcription fallback:', errStr.slice(0, 180));
      }
    }

    const effectiveMessage = [cleanMessage, transcript].filter(Boolean).join('\n').trim();
    const shouldSendRawAudio = Boolean(parsedAudio && !transcript);

    ensureServerSyncedToToday();
    const state = db.gameState;
    const instantAnswer = effectiveMessage
      ? tryInstantGameAnswer(state, pid, effectiveMessage, lang)
      : null;

    if (instantAnswer) {
      writeEvent({ type: 'delta', text: instantAnswer });
      writeEvent({ type: 'done', answer: instantAnswer, sources: [], transcript: transcript || undefined });
      if (!res.writableEnded) res.end();
      return;
    }

    const inGameQuery = effectiveMessage ? isInGameQuestion(effectiveMessage) : true;
    const {
      systemInstruction,
      rankedOrder,
      standingsSummary,
      todayTasksSummary,
      diceContext,
    } = buildAiContext(state, pid, lang, inGameQuery);

    const formattedHistory = formatAiChatHistory(history);

    const shouldTrySearchGrounding =
      !shouldSendRawAudio &&
      !inGameQuery &&
      needsRealtimeWebSearch(effectiveMessage) &&
      Date.now() > searchGroundingCooldownUntil;

    const seenUris = new Set<string>();
    const sources: Array<{ title: string; uri: string }> = [];
    let fullAnswer = '';

    const runChatStream = async (model: string, thinkingLevel: ThinkingLevel, useSearch: boolean) => {
      if (shouldSendRawAudio && parsedAudio) {
        const audioPart = {
          inlineData: {
            mimeType: parsedAudio.mimeType,
            data: parsedAudio.data,
          },
        };
        const textPart = {
          text:
            cleanMessage ||
            'Ouça a mensagem de áudio do participante e responda de forma rápida e direta em português.',
        };
        const stream = await ai.models.generateContentStream({
          model,
          contents: [...formattedHistory, { role: 'user', parts: [audioPart, textPart] }],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel },
            maxOutputTokens: 420,
          },
        });
        for await (const chunk of stream) {
          if (clientClosed) break;
          const delta = typeof chunk.text === 'string' ? chunk.text : '';
          if (delta) {
            fullAnswer += delta;
            writeEvent({ type: 'delta', text: delta });
          }
        }
        return;
      }

      const chat = ai.chats.create({
        model,
        history: formattedHistory,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel },
          maxOutputTokens: 420,
          ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      const stream = await chat.sendMessageStream({ message: effectiveMessage });
      for await (const chunk of stream) {
        if (clientClosed) break;
        const delta = typeof chunk.text === 'string' ? chunk.text : '';
        if (delta) {
          fullAnswer += delta;
          writeEvent({ type: 'delta', text: delta });
        }
        extractGroundingSources(
          chunk.candidates?.[0]?.groundingMetadata?.groundingChunks,
          seenUris,
          sources
        );
      }
    };

    try {
      let streamed = false;

      if (shouldTrySearchGrounding) {
        try {
          await runChatStream('gemini-4-hydrogen', ThinkingLevel.LOW, true);
          streamed = fullAnswer.length > 0;
        } catch (searchErr) {
          const errStr = searchErr instanceof Error ? searchErr.message : String(searchErr || '');
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
            searchGroundingCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn('Meta AI stream search fallback:', errStr.slice(0, 180));
        }
      }

      if (!streamed && !clientClosed) {
        if (shouldSendRawAudio) {
          await runChatStream('gemini-4-hydrogen', ThinkingLevel.LOW, false);
          streamed = true;
        } else {
          try {
            await runChatStream('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL, false);
            streamed = true;
          } catch (fastErr) {
            if (fullAnswer.length > 0) {
              streamed = true;
            } else {
              const errStr = fastErr instanceof Error ? fastErr.message : String(fastErr || '');
              const lowerErr = errStr.toLowerCase();
              const isAuthError =
                lowerErr.includes('403') ||
                lowerErr.includes('permission_denied') ||
                lowerErr.includes('api_key_invalid') ||
                lowerErr.includes('api key not valid');
              if (isAuthError) throw fastErr;

              await runChatStream('gemini-4-hydrogen', ThinkingLevel.LOW, false);
              streamed = true;
            }
          }
        }
      }

      if (!clientClosed) {
        const finalAnswer = fullAnswer.trim() || 'Não foi possível gerar uma resposta agora.';
        if (!fullAnswer.trim()) {
          writeEvent({ type: 'delta', text: finalAnswer });
        }
        writeEvent({
          type: 'done',
          answer: finalAnswer,
          sources: sources.slice(0, 6),
          transcript: transcript || undefined,
        });
      }
    } catch (err) {
      if (!clientClosed) {
        if (inGameQuery && effectiveMessage) {
          const leaderName = getParticipantName(state, rankedOrder[0]);
          const leaderStars = state.participants[rankedOrder[0]].stars;
          const fallbackSummary = [
            `📊 Resumo ao vivo do jogo (${state.currentDateStr} · ${getEffectiveClockHHMM(state)}):`,
            `🏆 Liderança atual: ${leaderName} com ${leaderStars}⭐.`,
            `⭐ Placar completo: ${standingsSummary}`,
            `📋 Tarefas de hoje: ${todayTasksSummary}`,
            `🎲 ${diceContext}`,
          ].join('\n\n');
          writeEvent({ type: 'delta', text: fallbackSummary });
          writeEvent({ type: 'done', answer: fallbackSummary, sources: [], transcript: transcript || undefined });
        } else {
          const formatted = formatGeminiErrorPtBr(err);
          writeEvent({ type: 'error', error: formatted.message, status: formatted.status });
        }
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');

    const { participantId, token, message, history, lang, audio } = req.body || {};
    const pid = participantId as ParticipantId;
    const cred = db.credentials[pid];
    if (!cred || !cred.sessionTokens.includes(token)) {
      return res.status(401).json({ ok: false, error: 'Autenticação necessária para conversar com a IA.' });
    }

    const parsedAudio = parseIncomingAudioPayload(audio);
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage && !parsedAudio) {
      return res.status(400).json({ ok: false, error: 'Digite uma mensagem ou grave um áudio para conversar com a IA.' });
    }
    if (cleanMessage.length > 1500) {
      return res.status(400).json({ ok: false, error: 'Mensagem muito longa (máximo 1500 caracteres).' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        ok: false,
        error: 'Chave GEMINI_API_KEY não configurada no servidor. Configure em Settings > Secrets.',
      });
    }

    const ai = getGeminiClient(apiKey);
    let transcript = '';
    if (parsedAudio) {
      try {
        transcript = await transcribeAudioWithGemini(ai, parsedAudio);
      } catch (transcribeErr) {
        const errStr = transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr || '');
        const lowerErr = errStr.toLowerCase();
        if (
          lowerErr.includes('403') ||
          lowerErr.includes('permission_denied') ||
          lowerErr.includes('api_key_invalid') ||
          lowerErr.includes('api key not valid')
        ) {
          const formatted = formatGeminiErrorPtBr(transcribeErr);
          return res.status(formatted.status).json({ ok: false, error: formatted.message });
        }
      }
    }

    const effectiveMessage = [cleanMessage, transcript].filter(Boolean).join('\n').trim();
    const shouldSendRawAudio = Boolean(parsedAudio && !transcript);

    ensureServerSyncedToToday();
    const state = db.gameState;
    const instantAnswer = effectiveMessage
      ? tryInstantGameAnswer(state, pid, effectiveMessage, lang)
      : null;
    if (instantAnswer) {
      return res.json({
        ok: true,
        answer: instantAnswer,
        sources: [],
        transcript: transcript || undefined,
      });
    }

    const inGameQuery = effectiveMessage ? isInGameQuestion(effectiveMessage) : true;
    const {
      systemInstruction,
      rankedOrder,
      standingsSummary,
      todayTasksSummary,
      diceContext,
    } = buildAiContext(state, pid, lang, inGameQuery);

    const formattedHistory = formatAiChatHistory(history);

    const shouldTrySearchGrounding =
      !shouldSendRawAudio &&
      !inGameQuery &&
      needsRealtimeWebSearch(effectiveMessage) &&
      Date.now() > searchGroundingCooldownUntil;

    let response;
    try {
      if (shouldSendRawAudio && parsedAudio) {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            ...formattedHistory,
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: parsedAudio.mimeType, data: parsedAudio.data } },
                {
                  text:
                    cleanMessage ||
                    'Ouça a mensagem de áudio do participante e responda de forma rápida e direta em português.',
                },
              ],
            },
          ],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 420,
          },
        });
      }

      if (!response && shouldTrySearchGrounding) {
        try {
          const chat = ai.chats.create({
            model: 'gemini-4-hydrogen',
            history: formattedHistory,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              maxOutputTokens: 420,
              tools: [{ googleSearch: {} }],
            },
          });
          response = await chat.sendMessage({ message: effectiveMessage });
        } catch (searchErr) {
          const errStr = searchErr instanceof Error ? searchErr.message : String(searchErr || '');
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
            searchGroundingCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn('AI Chat Search grounding fallback:', errStr.slice(0, 180));
        }
      }

      if (!response) {
        try {
          const chat = ai.chats.create({
            model: 'gemini-3.1-flash-lite',
            history: formattedHistory,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              maxOutputTokens: 420,
            },
          });
          response = await chat.sendMessage({ message: effectiveMessage });
        } catch (fastErr) {
          const errStr = fastErr instanceof Error ? fastErr.message : String(fastErr || '');
          const isTransient =
            errStr.includes('429') ||
            errStr.includes('503') ||
            errStr.includes('RESOURCE_EXHAUSTED') ||
            errStr.includes('UNAVAILABLE');
          if (!isTransient) throw fastErr;

          const fallbackChat = ai.chats.create({
            model: 'gemini-4-hydrogen',
            history: formattedHistory,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              maxOutputTokens: 420,
            },
          });
          response = await fallbackChat.sendMessage({ message: effectiveMessage });
        }
      }

      const answer = (response.text || '').trim();
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];
      extractGroundingSources(rawChunks, seenUris, sources);

      return res.json({
        ok: true,
        answer: answer || 'Não foi possível gerar uma resposta agora.',
        sources: sources.slice(0, 6),
        transcript: transcript || undefined,
      });
    } catch (err) {
      if (inGameQuery && effectiveMessage) {
        const leaderName = getParticipantName(state, rankedOrder[0]);
        const leaderStars = state.participants[rankedOrder[0]].stars;
        const fallbackSummary = [
          `📊 Resumo ao vivo do jogo (${state.currentDateStr} · ${getEffectiveClockHHMM(state)}):`,
          `🏆 Liderança atual: ${leaderName} com ${leaderStars}⭐.`,
          `⭐ Placar completo: ${standingsSummary}`,
          `📋 Tarefas de hoje: ${todayTasksSummary}`,
          `🎲 ${diceContext}`,
        ].join('\n\n');
        return res.json({
          ok: true,
          answer: fallbackSummary,
          sources: [],
          transcript: transcript || undefined,
        });
      }

      const formatted = formatGeminiErrorPtBr(err);
      return res.status(formatted.status).json({
        ok: false,
        error: formatted.message,
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.json'
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return { app, server };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  const PORT = Number(process.env.PORT || 3000);
  createAppServer().then(({ server }) => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Estrelas da Casa server listening on http://0.0.0.0:${PORT}`);
    });
  });
}
