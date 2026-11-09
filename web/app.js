/*
 * Дзен счётчик — медитативный счётчик повторений
 * Клон https://zenrhythm-acpcbeeg.manus.space/ с улучшениями:
 *  - высокоточное планирование тиков (абсолютные тайм-лайны, без дрейфа setInterval)
 *  - 14 тем оформления
 *  - красочный анимированный обратный отсчёт и заставка
 *  - удобная компоновка элементов
 */
'use strict';

/* ================= Константы ================= */
const STORAGE_KEY = 'zen-counter-state-v1';

/* Хранилище состояния.
   localStorage может быть недоступен (приватный режим, неполноценный origin при
   загрузке страницы обёрткой) — тогда молча работаем в памяти, чтобы приложение
   не падало: счёт продолжит идти, просто не переживёт перезапуск. */
const store = (() => {
  try {
    localStorage.setItem(STORAGE_KEY + '-probe', '1');
    localStorage.removeItem(STORAGE_KEY + '-probe');
    return localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k)
    };
  }
})();
const APP_VERSION = '1.0.0';

const THEMES = {
  cosmos:   { id: 'cosmos',   name: 'Космос',     bg0: '#0b1020', bg1: '#241b52', accent: '#22d3ee', accent2: '#a78bfa', accent3: '#fbbf24' },
  nature:   { id: 'nature',   name: 'Природа',    bg0: '#08200f', bg1: '#1c5630', accent: '#86efac', accent2: '#fde68a', accent3: '#4ade80' },
  silence:  { id: 'silence',  name: 'Тишина',     bg0: '#0e1319', bg1: '#232f3d', accent: '#cbd5e1', accent2: '#93a7bd', accent3: '#e2e8f0' },
  mystic:   { id: 'mystic',   name: 'Мистика',    bg0: '#100620', bg1: '#3b0f6b', accent: '#c084fc', accent2: '#f472b6', accent3: '#818cf8' },
  yoga:     { id: 'yoga',     name: 'Йога',       bg0: '#2a1620', bg1: '#5b3340', accent: '#fda4af', accent2: '#fbbf24', accent3: '#f472b6' },
  esoteric: { id: 'esoteric', name: 'Эзотерика',  bg0: '#04211d', bg1: '#0c4b3f', accent: '#facc15', accent2: '#2dd4bf', accent3: '#a3e635' },
  candles:  { id: 'candles',  name: 'Свечи',      bg0: '#160e04', bg1: '#3e2d10', accent: '#fde68a', accent2: '#fb923c', accent3: '#fcd34d' },
  warmth:   { id: 'warmth',   name: 'Тепло',      bg0: '#2c1a0f', bg1: '#6b4423', accent: '#fdba74', accent2: '#fde68a', accent3: '#fca5a5' },
  sea:      { id: 'sea',      name: 'Море',       bg0: '#03242e', bg1: '#0a4a5a', accent: '#22d3ee', accent2: '#fcd34d', accent3: '#67e8f9' },
  ocean:    { id: 'ocean',    name: 'Океан',      bg0: '#032a44', bg1: '#0c5a80', accent: '#38bdf8', accent2: '#22d3ee', accent3: '#818cf8' },
  forest:   { id: 'forest',   name: 'Лес',        bg0: '#04240f', bg1: '#155e2c', accent: '#4ade80', accent2: '#a3e635', accent3: '#2dd4bf' },
  ember:    { id: 'ember',    name: 'Уголёк',     bg0: '#1a0800', bg1: '#4a1607', accent: '#fb923c', accent2: '#f43f5e', accent3: '#fbbf24' },
  sakura:   { id: 'sakura',   name: 'Сакура',     bg0: '#1b0914', bg1: '#541a4a', accent: '#f472b6', accent2: '#fda4af', accent3: '#c084fc' },
  mono:     { id: 'mono',     name: 'Моно',       bg0: '#05070a', bg1: '#1e222a', accent: '#e2e8f0', accent2: '#94a3b8', accent3: '#cbd5e1' }
};

const SOUNDS = [
  { id: 'click', name: 'Щелчок' },
  { id: 'bell', name: 'Колокольчик' },
  { id: 'gong', name: 'Гонг' },
  { id: 'bowl', name: 'Поющая чаша' },
  { id: 'drop', name: 'Капля' },
  { id: 'om', name: 'Ом' },
  { id: 'none', name: 'Без звука' }
];

const FEEDBACK_MODES = [
  { id: 'sound', name: 'Звук' },
  { id: 'vibration', name: 'Вибро' },
  { id: 'both', name: 'Оба' },
  { id: 'none', name: 'Нет' }
];

const QUICK_INTERVALS = [200, 300, 500, 1000, 2000];

const DEFAULT_PRESET = {
  id: 'preset-default',
  name: '108',
  total_reps: 108,
  interval_ms: 500,
  count_up: true,
  countdown_seconds: 3,
  sound_name: 'bowl',
  feedback_mode: 'sound',
  custom_sounds: [],
  auto_loop: false,
  use_theme_colors: true,
  tick_color: '#22d3ee',
  interval_color: '#6366f1'
};

/* ================= Утилиты ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

function rgba(hex, a) {
  const h = String(hex || '#ffffff').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function fmtInterval(ms) {
  const v = Math.round(ms);
  if (v >= 1000) {
    const s = Math.round((v / 1000) * 100) / 100;
    return { num: String(s), unit: 'с' };
  }
  return { num: String(v), unit: 'мс' };
}
const fmtIntervalText = (ms) => { const f = fmtInterval(ms); return `${f.num} ${f.unit}`; };

function soundLabel(id) {
  const s = SOUNDS.find((x) => x.id === id);
  return s ? s.name : id;
}

/* ================= Состояние ================= */
function freshState() {
  return {
    themeId: 'cosmos',
    activeTab: 'counter',
    activePresetId: DEFAULT_PRESET.id,
    count: 0,
    muted: false,
    presets: [{ ...DEFAULT_PRESET, custom_sounds: [] }]
  };
}

function sanitizePreset(p) {
  const out = { ...DEFAULT_PRESET, ...p };
  out.id = String(out.id || `preset-${Date.now()}`);
  out.name = String(out.name || 'Пресет').slice(0, 48);
  out.total_reps = clamp(Math.round(Number(out.total_reps) || 108), 1, 10000);
  out.interval_ms = clamp(Math.round(Number(out.interval_ms) || 500), 100, 10000);
  out.countdown_seconds = clamp(Math.round(Number(out.countdown_seconds) || 0), 0, 15);
  out.count_up = out.count_up !== false;
  out.auto_loop = !!out.auto_loop;
  out.use_theme_colors = out.use_theme_colors !== false;
  out.custom_sounds = Array.isArray(out.custom_sounds)
    ? out.custom_sounds.filter((s) => s && s.name && s.dataUrl).slice(0, 8)
    : [];
  if (!SOUNDS.some((s) => s.id === out.sound_name) && !out.custom_sounds.some((s) => s.name === out.sound_name)) {
    out.sound_name = 'bowl';
  }
  if (!FEEDBACK_MODES.some((m) => m.id === out.feedback_mode)) out.feedback_mode = 'sound';
  return out;
}

function loadState() {
  try {
    const raw = JSON.parse(store.getItem(STORAGE_KEY));
    if (!raw || !Array.isArray(raw.presets) || !raw.presets.length) return freshState();
    const base = freshState();
    const presets = raw.presets.map((p, i) => sanitizePreset({ ...DEFAULT_PRESET, ...p, id: String(p.id || `preset-${i + 1}`) }));
    const activePresetId = presets.some((p) => p.id === raw.activePresetId) ? raw.activePresetId : presets[0].id;
    const state = {
      ...base,
      presets,
      activePresetId,
      count: clamp(Math.round(Number(raw.count) || 0), 0, presets.find((p) => p.id === activePresetId).total_reps),
      themeId: THEMES[raw.themeId] ? raw.themeId : base.themeId,
      activeTab: ['counter', 'presets', 'settings'].includes(raw.activeTab) ? raw.activeTab : 'counter',
      muted: !!raw.muted
    };
    return state;
  } catch {
    return freshState();
  }
}

let state = loadState();

let lastSaveAt = 0;
let saveTimer = null;

function persist(immediate) {
  const write = () => {
    saveTimer = null;
    lastSaveAt = Date.now();
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* хранило переполнено — молча игнорируем, счёт не прерываем */
    }
  };
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (immediate) {
    write();
    return;
  }
  const elapsed = Date.now() - lastSaveAt;
  if (elapsed >= 1200) write();
  else saveTimer = setTimeout(write, 1200 - elapsed);
}

const activePreset = () =>
  state.presets.find((p) => p.id === state.activePresetId) || state.presets[0] || sanitizePreset(DEFAULT_PRESET);

const activeTheme = () => THEMES[state.themeId] || THEMES.cosmos;

/* ================= Иконки ================= */
const ICON_PATHS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.6" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.6" fill="currentColor" stroke="none"/>',
  reset:
    '<path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1"/><path d="M3.2 6.6v5h5"/>',
  up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  sound:
    '<path d="M11 5 6.5 9H3.5v6h3L11 19z" fill="currentColor" stroke="none"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.8 6.5a8 8 0 0 1 0 11"/>',
  mute:
    '<path d="M11 5 6.5 9H3.5v6h3L11 19z" fill="currentColor" stroke="none"/><path d="m15.5 9.5 5 5"/><path d="m20.5 9.5-5 5"/>',
  settings:
    '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2.2"/><path d="M4 17h6"/><path d="M14 17h6"/><circle cx="12" cy="17" r="2.2"/>',
  list:
    '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h7"/><circle cx="4.5" cy="6" r="1.4"/><circle cx="4.5" cy="12" r="1.4"/><circle cx="4.5" cy="18" r="1.4"/>',
  counter:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 3.5v2"/><path d="M12 18.5v2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M12.5 20H21"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L8 18l-4.2 1.2L5 15z"/>',
  copy:
    '<rect x="8.5" y="8.5" width="12" height="12" rx="2.4"/><path d="M15.5 8.5V5.6A2.1 2.1 0 0 0 13.4 3.5H5.6A2.1 2.1 0 0 0 3.5 5.6v7.8a2.1 2.1 0 0 0 2.1 2.1h2.9"/>',
  trash:
    '<path d="M4 6.5h16"/><path d="M9.5 6.5V4.8h5v1.7"/><path d="m18.5 6.5-1 13.2h-11l-1-13.2"/><path d="M10.5 10.5v6"/><path d="M13.5 10.5v6"/>',
  close: '<path d="m6.5 6.5 11 11"/><path d="m17.5 6.5-11 11"/>',
  more: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2.1-1 1.6-2-.6-1.3.2-2.5 1.7-2.5h1.6A3.6 3.6 0 0 0 20.5 12 8.5 8.5 0 0 0 12 3.5z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="7.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.4" cy="7.4" r="1.1" fill="currentColor" stroke="none"/>',
  wave: '<path d="M3 12c1.8-3.4 3.6-3.4 5.4 0s3.6 3.4 5.4 0 3.6-3.4 5.4 0"/><path d="M3 17c1.8-3.4 3.6-3.4 5.4 0s3.6 3.4 5.4 0 3.6-3.4 5.4 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  loop: '<path d="M4 9.5A5.5 5.5 0 0 1 9.5 4H18"/><path d="m15 1.5 3 2.5-3 2.5"/><path d="M20 14.5A5.5 5.5 0 0 1 14.5 20H6"/><path d="m9 22.5-3-2.5 3-2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  spark: '<path d="m12 3.5 2 5.7 5.7 2-5.7 2-2 5.7-2-5.7-5.7-2 5.7-2z" fill="currentColor" stroke="none"/>'
};

function icon(name, size = 22) {
  const path = ICON_PATHS[name];
  // Отсутствующая иконка — баг (кнопка станет невидимой), громко логируем,
  // чтобы тест «нет ошибок в консоли» его поймал.
  if (!path) console.error(`[icon] не найдена иконка "${name}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path || ''}</svg>`;
}

/* ================= DOM ================= */
const root = document.getElementById('app');
const main = document.getElementById('main');
const nav = document.getElementById('bottom-nav');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');
const ambient = document.getElementById('ambient');

/* ================= Движок: точное планирование тиков ================= */
/*
 * Вместо setInterval(…, N), который дрейфует из-за накопления ошибок таймера
 * и нагрузки на главный поток, тики планируются по абсолютной шкале:
 *   nextAt += interval
 * и каждый раз подстраивается по performance.now(). Погрешность одного тика
 * не накапливается: отклонение держится на уровне задержки самого таймера.
 */
let runMode = 'idle'; // idle | countdown | running | done
let timerId = null;
let engineInterval = 500;
let nextTickAt = 0;
let cdEndAt = 0;
let cdNextAt = 0;
let completionTimerId = null;
const tickLog = [];

function clearTimers() {
  if (timerId) clearTimeout(timerId);
  if (completionTimerId) clearTimeout(completionTimerId);
  timerId = null;
  completionTimerId = null;
}

function keepScreenOn(on) {
  try {
    if (window.ZenBridge && typeof window.ZenBridge.keepScreenOn === 'function') {
      window.ZenBridge.keepScreenOn(on ? 1 : 0);
    }
  } catch (e) {
    /* мост недоступен — веб-режим */
  }
}

function armTick() {
  if (timerId) clearTimeout(timerId);
  timerId = null;
  if (runMode !== 'running') return;
  const delay = Math.max(0, nextTickAt - performance.now());
  timerId = setTimeout(onTickAlarm, delay);
}

function onTickAlarm() {
  timerId = null;
  if (runMode !== 'running') return;
  fireTick();
  const now = performance.now();
  nextTickAt += engineInterval;
  // Если вкладка была "усыплена" браузером — не гонимся за пропущенными тиками,
  // а перепланируем от текущего момента.
  if (nextTickAt < now - engineInterval) nextTickAt = now + engineInterval;
  armTick();
}

function armCountdown() {
  if (timerId) clearTimeout(timerId);
  timerId = null;
  if (runMode !== 'countdown') return;
  const now = performance.now();
  if (cdEndAt - now <= 0) {
    finishCountdown();
    return;
  }
  if (cdNextAt <= now) cdNextAt = now + 60;
  timerId = setTimeout(onCountdownAlarm, Math.max(0, cdNextAt - now));
}

function onCountdownAlarm() {
  timerId = null;
  if (runMode !== 'countdown') return;
  const now = performance.now();
  const remain = cdEndAt - now;
  if (remain <= 0) {
    finishCountdown();
    return;
  }
  showCountdownNumber(Math.ceil(remain / 1000));
  haptic(22);
  cdNextAt += 1000;
  if (cdNextAt <= now) cdNextAt = now + 1000;
  armCountdown();
}

function startRun() {
  const p = activePreset();
  clearTimers();
  hideCountdown();
  if (p.count_up && state.count >= p.total_reps) state.count = 0;
  if (!p.count_up && state.count <= 0) state.count = p.total_reps;
  persist(true);

  const cd = clamp(p.countdown_seconds || 0, 0, 15);
  if (cd > 0) {
    runMode = 'countdown';
    const now = performance.now();
    cdEndAt = now + cd * 1000;
    cdNextAt = now + 1000;
    showCountdown(cd);
    armCountdown(); // иначе отсчёт показывается, но никогда не досчитывает до старта
  } else {
    beginRunning();
  }
  updateCounter();
}

function beginRunning() {
  const p = activePreset();
  engineInterval = clamp(p.interval_ms || 500, 50, 10000);
  runMode = 'running';
  hideCountdown();
  nextTickAt = performance.now() + engineInterval;
  armTick();
  keepScreenOn(true);
  updateCounter();
}

function finishCountdown() {
  if (runMode !== 'countdown') return;
  hideCountdown();
  beginRunning();
}

function stopRun() {
  const wasActive = runMode !== 'idle';
  clearTimers();
  runMode = 'idle';
  hideCountdown();
  keepScreenOn(false);
  persist(true);
  if (wasActive) updateCounter();
}

function fireTick() {
  const p = activePreset();
  const goal = p.total_reps;

  tickLog.push({ t: performance.now(), count: state.count });
  if (tickLog.length > 400) tickLog.splice(0, tickLog.length - 400);

  feedback(p);

  const next = state.count + (p.count_up ? 1 : -1);
  const done = p.count_up ? next >= goal : next <= 0;
  state.count = done ? (p.count_up ? goal : 0) : next;
  persist();

  updateCounter();
  flashTick();

  if (done) onComplete(p);
}

function onComplete(p) {
  runMode = 'done';
  if (timerId) clearTimeout(timerId);
  timerId = null;
  keepScreenOn(false);
  celebrate();
  completeFeedback(p);
  updateCounter();

  if (p.auto_loop) {
    completionTimerId = setTimeout(() => {
      completionTimerId = null;
      if (runMode !== 'done') return;
      state.count = p.count_up ? 0 : p.total_reps;
      persist();
      startRun();
    }, 1700);
  }
}

function changeInterval(ms) {
  const p = activePreset();
  const value = clamp(Math.round(ms), 100, 10000);
  p.interval_ms = value;
  if (runMode === 'running') {
    engineInterval = value;
    nextTickAt = performance.now() + value;
    armTick();
  }
  persist();
}

function resetCount() {
  const p = activePreset();
  stopRun();
  state.count = p.count_up ? 0 : p.total_reps;
  persist(true);
  render();
}

function toggleDirection() {
  const p = activePreset();
  p.count_up = !p.count_up;
  state.count = p.count_up ? 0 : p.total_reps;
  persist(true);
  render();
  toast(p.count_up ? 'Счёт вверх ↑' : 'Счёт вниз ↓');
}

function toggleRun() {
  if (runMode === 'running' || runMode === 'countdown') stopRun();
  else startRun();
}

/* ================= Звук и вибро ================= */
let audioCtx = null;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

function haptic(pattern) {
  try {
    if (navigator.vibrate) return navigator.vibrate(pattern);
  } catch (e) {
    /* нет поддержки */
  }
  return false;
}

function tone(ctx, { freq, endFreq, type = 'sine', dur = 0.3, vol = 0.12, attack = 0.006, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function playSound(name, customSounds = []) {
  if (state.muted || !name || name === 'none') return;
  const custom = (customSounds || []).find((s) => s.name === name);
  if (custom && custom.dataUrl) {
    try {
      const audio = new Audio(custom.dataUrl);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (e) {
      /* не воспроизводится — тихо игнорируем */
    }
    return;
  }
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    switch (name) {
      case 'click':
        tone(ctx, { freq: 1150, type: 'triangle', dur: 0.07, vol: 0.1, attack: 0.003 });
        break;
      case 'bell':
        tone(ctx, { freq: 1320, type: 'sine', dur: 0.85, vol: 0.1 });
        tone(ctx, { freq: 2640, type: 'sine', dur: 0.5, vol: 0.035, delay: 0.01 });
        break;
      case 'gong':
        tone(ctx, { freq: 232, endFreq: 74, type: 'sine', dur: 1.5, vol: 0.16, attack: 0.02 });
        tone(ctx, { freq: 348, endFreq: 110, type: 'sine', dur: 1.2, vol: 0.06, attack: 0.03 });
        break;
      case 'bowl':
        tone(ctx, { freq: 432, type: 'sine', dur: 1.5, vol: 0.11, attack: 0.03 });
        tone(ctx, { freq: 648, type: 'sine', dur: 1.3, vol: 0.05, attack: 0.05 });
        tone(ctx, { freq: 216, type: 'sine', dur: 1.6, vol: 0.05, attack: 0.06 });
        break;
      case 'drop':
        tone(ctx, { freq: 1650, endFreq: 520, type: 'sine', dur: 0.3, vol: 0.11, attack: 0.004 });
        break;
      case 'om':
        tone(ctx, { freq: 136.1, type: 'sine', dur: 1.7, vol: 0.14, attack: 0.12 });
        tone(ctx, { freq: 68.05, type: 'sine', dur: 1.7, vol: 0.07, attack: 0.16 });
        tone(ctx, { freq: 272.2, type: 'sine', dur: 1.2, vol: 0.04, attack: 0.14 });
        break;
      default:
        tone(ctx, { freq: 900, type: 'triangle', dur: 0.09, vol: 0.1 });
    }
  } catch (e) {
    /* звук не должен прерывать счёт */
  }
}

function feedback(p) {
  const mode = FEEDBACK_MODES.some((m) => m.id === p.feedback_mode) ? p.feedback_mode : 'sound';
  if (mode === 'none') return;
  const wantsVib = mode === 'vibration' || mode === 'both';
  const wantsSound = mode === 'sound' || mode === 'both';
  let vibOk = false;
  if (wantsVib) vibOk = !!haptic(14);
  if (wantsSound || (wantsVib && !vibOk)) {
    // Если вибрация недоступна — тихо подменяем её звуком
    playSound(p.sound_name, p.custom_sounds);
  }
}

function completeFeedback(p) {
  const mode = FEEDBACK_MODES.some((m) => m.id === p.feedback_mode) ? p.feedback_mode : 'sound';
  if (mode === 'none') return;
  haptic([0, 70, 60, 140]);
  if (state.muted) return;
  const name = p.sound_name === 'none' || p.sound_name === 'click' ? 'gong' : p.sound_name;
  playSound(name, p.custom_sounds);
}

/* ================= Визуал: счётчик ================= */
function progressRatio(p) {
  const goal = Math.max(1, p.total_reps);
  const count = clamp(state.count, 0, goal);
  return p.count_up ? count / goal : 1 - count / goal;
}

function beadsMarkup(goal) {
  const n = clamp(Math.round(goal), 1, 108);
  const r = 155;
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const cx = 160 + r * Math.cos(a);
    const cy = 160 + r * Math.sin(a);
    out += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3.4"></circle>`;
  }
  return out;
}

const WAVE_D =
  'M-320,0 Q-240,-8 -160,0 T0,0 T160,0 T320,0 T480,0 T640,0 L640,400 L-320,400 Z';

function renderCounter() {
  const p = activePreset();
  const f = fmtInterval(p.interval_ms);
  const chips = QUICK_INTERVALS.map((ms) => {
    const on = Math.abs(ms - p.interval_ms) < 1;
    return `<button class="quick-chip ${on ? 'is-active' : ''}" type="button" data-action="quick-interval" data-ms="${ms}">${fmtIntervalText(ms)}</button>`;
  }).join('');

  return `
  <section class="screen counter-screen" aria-label="Счётчик">
    <div class="preset-strip">
      <button class="preset-pill" type="button" data-action="tab" data-tab="presets">
        <span class="pill-dot"></span>
        <span class="pill-name">${esc(p.name)}</span>
        <span class="pill-meta">${p.total_reps} × ${f.num} ${f.unit}</span>
      </button>
      <span class="spacer"></span>
      <button class="preset-pill" type="button" data-action="edit-preset" data-id="${esc(p.id)}">
        <span class="pill-name">Изменить</span>${icon('edit', 15)}
      </button>
    </div>

    <div class="dial-wrap">
      <div class="dial" data-action="toggle-run" role="button" tabindex="0"
           aria-label="${runMode === 'running' ? 'Пауза' : 'Старт'}">
        <svg class="dial-svg" viewBox="0 0 320 320" aria-hidden="true">
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:var(--accent)"></stop>
              <stop offset="55%" style="stop-color:var(--accent2)"></stop>
              <stop offset="100%" style="stop-color:var(--accent3)"></stop>
            </linearGradient>
            <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style="stop-color:var(--accent)" stop-opacity="0.55"></stop>
              <stop offset="100%" style="stop-color:var(--accent2)" stop-opacity="0.1"></stop>
            </linearGradient>
            <clipPath id="dialClip"><circle cx="160" cy="160" r="132"></circle></clipPath>
          </defs>
          <circle class="ring-bg" cx="160" cy="160" r="140"></circle>
          <g clip-path="url(#dialClip)">
            <g class="water" id="water" style="transform:translateY(340px)">
              <g class="wave-slide wave-slide-back">
                <path d="${WAVE_D}" fill="url(#waterGrad)" opacity="0.34"></path>
              </g>
              <g class="wave-slide">
                <path d="${WAVE_D}" fill="url(#waterGrad)" opacity="0.6"></path>
              </g>
            </g>
          </g>
          <circle class="ring-progress" id="ring-progress" cx="160" cy="160" r="140"
                  pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000"></circle>
          <g class="ring-head" id="ring-head"><circle cx="160" cy="20" r="7"></circle></g>
          <g class="beads" id="beads">${beadsMarkup(p.total_reps)}</g>
        </svg>
        <div class="dial-center">
          <div class="count-value" id="count-value">0</div>
          <div class="count-caption" id="count-caption">из ${p.total_reps}</div>
          <div class="count-status" id="count-status"></div>
        </div>
        <div class="tick-ripple" id="tick-ripple"></div>
        <div class="countdown is-hidden" id="countdown">
          <div class="countdown-ring" id="countdown-ring"></div>
          <div class="countdown-number" id="countdown-number">3</div>
          <div class="countdown-hint">настройтесь</div>
        </div>
      </div>
    </div>

    <div class="progress-row">
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" id="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
      <div class="progress-pct" id="progress-pct">0%</div>
    </div>

    <div class="transport">
      <button class="round-button" type="button" data-action="reset" aria-label="Сброс" title="Сброс">${icon('reset')}</button>
      <button class="play-button" id="play-button" type="button" data-action="toggle-run" aria-label="Старт">${icon('play', 30)}</button>
      <button class="round-button" type="button" data-action="direction" aria-label="Направление счёта" title="Направление">${icon(p.count_up ? 'up' : 'down')}</button>
    </div>

    <div class="interval-card">
      <div class="interval-head">
        <span class="interval-title">Интервал тика</span>
        <span class="interval-value" id="interval-value">${f.num}<small> ${f.unit}</small></span>
      </div>
      <div class="interval-row">
        <button class="round-button" type="button" data-action="interval" data-delta="-50" aria-label="Меньше на 50 мс">${icon('minus', 16)}</button>
        <input class="range" id="interval-range" type="range" min="100" max="5000" step="10"
               value="${p.interval_ms}" data-field="interval_ms" aria-label="Интервал, мс" />
        <button class="round-button" type="button" data-action="interval" data-delta="50" aria-label="Больше на 50 мс">${icon('plus', 16)}</button>
      </div>
      <div class="quick-chips">${chips}</div>
    </div>

    <div class="action-row">
      <button class="action-button ${p.sound_name !== 'none' && !state.muted ? 'is-on' : ''}" type="button" data-action="open-sound">
        ${icon(state.muted ? 'mute' : 'sound', 17)} <span>${state.muted ? 'Звук выкл.' : esc(soundLabel(p.sound_name))}</span>
      </button>
      <button class="action-button ${p.auto_loop ? 'is-on' : ''}" type="button" data-action="toggle-loop">
        ${icon('loop', 17)} <span>Автоцикл</span>
      </button>
      <button class="action-button" type="button" data-action="tab" data-tab="settings">
        ${icon('settings', 17)} <span>Настройки</span>
      </button>
    </div>
  </section>`;
}

function updateCounter() {
  const p = activePreset();
  const goal = Math.max(1, p.total_reps);
  const ratio = clamp(progressRatio(p), 0, 1);

  const countValue = $('#count-value');
  const caption = $('#count-caption');
  const status = $('#count-status');
  const ring = $('#ring-progress');
  const head = $('#ring-head');
  const beads = $('#beads');
  const water = $('#water');
  const fill = $('#progress-fill');
  const pct = $('#progress-pct');
  const bar = $('#progress-bar');
  const playBtn = $('#play-button');
  const intVal = $('#interval-value');
  const intRange = $('#interval-range');
  const pillMeta = $('.preset-pill .pill-meta');

  if (countValue) countValue.textContent = String(state.count);
  if (caption) caption.textContent = `из ${goal}`;

  if (status) {
    let text = '';
    if (runMode === 'running') text = `ритм ${fmtIntervalText(engineInterval)}`;
    else if (runMode === 'countdown') text = 'приготовьтесь';
    else if (runMode === 'done') text = 'цель достигнута';
    else if (runMode === 'idle' && state.count > 0) text = 'пауза';
    status.textContent = text;
    status.classList.toggle('is-visible', !!text);
  }

  if (ring) ring.setAttribute('stroke-dashoffset', String(Math.round(1000 * (1 - ratio))));
  if (head) head.style.transform = `rotate(${(ratio * 360).toFixed(2)}deg)`;

  if (beads) {
    const circles = beads.children;
    const n = circles.length;
    const lit = Math.round(ratio * n);
    for (let i = 0; i < n; i++) {
      const c = circles[i];
      const isLit = i < lit;
      const isHead = isLit && i === lit - 1;
      if (c.classList.contains('lit') !== isLit) c.classList.toggle('lit', isLit);
      if (c.classList.contains('head-bead') !== isHead) c.classList.toggle('head-bead', isHead);
    }
  }

  if (water) water.style.transform = `translateY(${((1 - ratio) * 340).toFixed(1)}px)`;
  if (fill) fill.style.width = `${(ratio * 100).toFixed(1)}%`;
  if (pct) pct.textContent = `${Math.round(ratio * 100)}%`;
  if (bar) bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));

  if (playBtn) {
    const running = runMode === 'running' || runMode === 'countdown';
    playBtn.innerHTML = running ? icon('pause', 30) : icon('play', 30);
    playBtn.classList.toggle('is-running', runMode === 'running');
    playBtn.setAttribute('aria-label', running ? 'Пауза' : 'Старт');
  }

  const f = fmtInterval(p.interval_ms);
  if (intVal) intVal.innerHTML = `${f.num}<small> ${f.unit}</small>`;
  if (intRange) {
    // Ползунок не должен «упираться» в максимум, если у пресета интервал больше 5 с
    const max = Math.max(5000, p.interval_ms);
    if (Number(intRange.max) !== max) intRange.max = String(max);
    if (Number(intRange.value) !== p.interval_ms) intRange.value = String(p.interval_ms);
  }
  if (pillMeta) pillMeta.textContent = `${p.total_reps} × ${f.num} ${f.unit}`;

  document.querySelectorAll('.quick-chip').forEach((chip) => {
    chip.classList.toggle('is-active', Math.abs(Number(chip.dataset.ms) - p.interval_ms) < 1);
  });
}

function flashTick() {
  const value = $('#count-value');
  const ripple = $('#tick-ripple');
  const ring = $('#ring-progress');
  const anim = (el, frames, opts) => {
    if (!el || !el.animate) return;
    try {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(frames, opts);
    } catch (e) {
      /* анимации недоступны */
    }
  };
  anim(
    value,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.09)', offset: 0.35 },
      { transform: 'scale(1)' }
    ],
    { duration: 280, easing: 'cubic-bezier(.2,.8,.3,1)' }
  );
  anim(
    ripple,
    [
      { transform: 'scale(0.72)', opacity: 0.55 },
      { transform: 'scale(1.18)', opacity: 0 }
    ],
    { duration: 560, easing: 'ease-out' }
  );
  if (ring) anim(ring, [{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 320, easing: 'ease-out' });
}

/* ================= Обратный отсчёт ================= */
function showCountdown(seconds) {
  const box = $('#countdown');
  if (!box) return;
  box.classList.remove('is-hidden');
  const dial = box.closest('.dial');
  if (dial) dial.classList.add('is-countdown'); // скрыть номер счётчика под отсчётом
  showCountdownNumber(seconds);
}

function hideCountdown() {
  const box = $('#countdown');
  if (!box) return;
  box.classList.add('is-hidden');
  const dial = box.closest('.dial');
  if (dial) dial.classList.remove('is-countdown');
}

function showCountdownNumber(n) {
  const el = $('#countdown-number');
  const ring = $('#countdown-ring');
  const hint = $('.countdown-hint');
  if (hint) hint.textContent = n <= 1 ? 'начинайте' : 'настройтесь';
  if (!el) return;
  el.textContent = String(n);
  const anim = (node, frames, opts) => {
    if (!node || !node.animate) return;
    try {
      node.getAnimations().forEach((a) => a.cancel());
      node.animate(frames, opts);
    } catch (e) {
      /* ignore */
    }
  };
  anim(
    el,
    [
      { transform: 'scale(0.3) rotate(-8deg)', opacity: 0, filter: 'blur(10px)' },
      { transform: 'scale(1.16) rotate(2deg)', opacity: 1, filter: 'blur(0px)', offset: 0.34 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, filter: 'blur(0px)', offset: 0.52 },
      { transform: 'scale(1.04)', opacity: 1, filter: 'blur(0px)' }
    ],
    { duration: 940, easing: 'cubic-bezier(.2,.85,.3,1)', fill: 'forwards' }
  );
  anim(
    ring,
    [
      { transform: 'scale(0.35)', opacity: 0.9, borderWidth: '5px' },
      { transform: 'scale(1.55)', opacity: 0, borderWidth: '1px' }
    ],
    { duration: 880, easing: 'ease-out' }
  );
}

/* ================= Праздник ================= */
function celebrate() {
  const layer = document.createElement('div');
  layer.className = 'celebrate';
  const t = activeTheme();
  const colors = [t.accent, t.accent2, t.accent3, '#ffffff'];
  for (let i = 0; i < 54; i++) {
    const bit = document.createElement('i');
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${(1.6 + Math.random() * 1.6).toFixed(2)}s`;
    bit.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4200);
  toast('Цель достигнута · набрано ' + state.count);
}

/* ================= Тост ================= */
let toastTimer = null;
function toast(message) {
  const old = toastRoot.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRoot.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  }, 2300);
}

/* ================= Разметка экранов ================= */
function navButton(id, label, iconName) {
  const current = state.activeTab === id;
  return `<button class="nav-button" type="button" data-action="tab" data-tab="${id}" aria-current="${current ? 'page' : 'false'}">${icon(iconName, 21)}<span>${label}</span></button>`;
}

function renderNav() {
  nav.innerHTML =
    navButton('counter', 'Счётчик', 'counter') +
    navButton('presets', 'Пресеты', 'list') +
    navButton('settings', 'Настройки', 'settings');
}

function themeCardsMarkup() {
  return Object.values(THEMES)
    .map((t) => {
      const pressed = state.themeId === t.id;
      const style = `background:radial-gradient(circle at 30% 26%, ${t.bg1}, ${t.bg0} 74%);--orb-a:${t.accent};box-shadow:inset 0 0 0 1px rgba(255,255,255,.16), 0 0 14px ${rgba(t.accent, 0.35)}`;
      return `<button class="theme-card" type="button" data-action="theme" data-theme="${t.id}" aria-pressed="${pressed}" style="${style}">
        <span class="theme-orb" style="${style}"></span><span>${t.name}</span></button>`;
    })
    .join('');
}

function soundCardsMarkup(p) {
  const names = [...SOUNDS.map((s) => s.id), ...(p.custom_sounds || []).map((s) => s.name)];
  return names
    .map((name) => {
      const pressed = p.sound_name === name;
      const label = SOUNDS.some((s) => s.id === name) ? soundLabel(name) : name;
      return `<button class="sound-card" type="button" data-action="pick-sound" data-sound="${esc(name)}" aria-pressed="${pressed}">
        ${icon(name === 'none' ? 'mute' : 'sound', 20)}<span>${esc(label)}</span></button>`;
    })
    .join('');
}

function renderPresets() {
  const cards = state.presets
    .map((p) => {
      const active = p.id === state.activePresetId;
      return `<div class="preset-card ${active ? 'is-active' : ''}" data-action="select-preset" data-id="${esc(p.id)}"
            role="button" tabindex="0" aria-pressed="${active}">
        <span class="preset-orb">${p.total_reps}</span>
        <span class="preset-info">
          <span class="preset-name">${esc(p.name)}</span>
          <span class="preset-meta">${fmtIntervalText(p.interval_ms)} · ${p.count_up ? '↑ возрастание' : '↓ убывание'}${p.countdown_seconds ? ` · отсчёт ${p.countdown_seconds} с` : ''}</span>
        </span>
        <span class="preset-badge">${active ? 'активен' : ''}</span>
        <span class="preset-actions">
          <button class="mini-button" type="button" data-action="edit-preset" data-id="${esc(p.id)}" aria-label="Изменить ${esc(p.name)}">${icon('edit', 16)}</button>
          <button class="mini-button" type="button" data-action="more-preset" data-id="${esc(p.id)}" aria-label="Действия с ${esc(p.name)}">${icon('more', 16)}</button>
        </span>
      </div>`;
    })
    .join('');

  return `<section class="screen" aria-label="Пресеты">
    <h1 class="screen-heading">Пресеты · режимы счёта</h1>
    <div class="preset-list">${cards}</div>
    <button class="wide-button" type="button" data-action="new-preset">${icon('plus', 18)}Новый пресет</button>
    <p class="settings-hint">Пресет хранит цель, интервал, направление, отсчёт и звук. Выбранный пресет открывается на вкладке «Счётчик».</p>
  </section>`;
}

function renderSettings() {
  const p = activePreset();
  const custom = p.custom_sounds || [];

  return `<section class="screen" aria-label="Настройки">
    <h1 class="screen-heading">Настройки</h1>

    <div class="settings-group">
      <h2 class="settings-title">Тема оформления</h2>
      <div class="theme-grid">${themeCardsMarkup()}</div>
    </div>

    <div class="settings-group">
      <h2 class="settings-title">Параметры счёта</h2>
      <label class="setting-line">
        <span>Повторений</span>
        <input class="range" type="range" min="1" max="1000" step="1" value="${p.total_reps}" data-field="total_reps" />
        <output>${p.total_reps}</output>
      </label>
      <label class="setting-line">
        <span>Интервал</span>
        <input class="range" type="range" min="100" max="${Math.max(5000, p.interval_ms)}" step="10" value="${p.interval_ms}" data-field="interval_ms" />
        <output>${fmtIntervalText(p.interval_ms)}</output>
      </label>
      <label class="setting-line">
        <span>Отсчёт перед стартом</span>
        <input class="range" type="range" min="0" max="10" step="1" value="${p.countdown_seconds}" data-field="countdown_seconds" />
        <output>${p.countdown_seconds} с</output>
      </label>
      <div class="form-field">
        <span>Направление счёта</span>
        <div class="segmented">
          <button type="button" class="${p.count_up ? 'is-active' : ''}" data-action="direction-set" data-value="up">Возрастание ↑</button>
          <button type="button" class="${!p.count_up ? 'is-active' : ''}" data-action="direction-set" data-value="down">Убывание ↓</button>
        </div>
      </div>
      <label class="check-row">
        <input type="checkbox" data-field="auto_loop" ${p.auto_loop ? 'checked' : ''} />
        Автоцикл — автоматически начинать заново после цели
      </label>
    </div>

    <div class="settings-group">
      <h2 class="settings-title">Отклик при тике</h2>
      <div class="form-field">
        <span>Режим</span>
        <div class="segmented">
          ${FEEDBACK_MODES.map((m) => `<button type="button" class="${p.feedback_mode === m.id ? 'is-active' : ''}" data-action="feedback-set" data-value="${m.id}">${m.name}</button>`).join('')}
        </div>
      </div>
      <div class="form-field">
        <span>Звук тика</span>
        <div class="sound-grid">${soundCardsMarkup(p)}</div>
      </div>
      <label class="upload-button">
        ${icon('plus', 16)} Загрузить свой звук
        <input type="file" accept="audio/*" data-action="upload-sound" />
      </label>
      ${custom
        .map(
          (s) => `<div class="about-row"><span>✦ ${esc(s.name)}</span>
            <button class="mini-button" type="button" data-action="remove-sound" data-name="${esc(s.name)}" aria-label="Удалить ${esc(s.name)}">${icon('trash', 16)}</button></div>`
        )
        .join('')}
      <p class="settings-hint">Вибрация работает на поддерживаемых устройствах; если её нет, режим «Вибро» тихо заменяется звуком.</p>
    </div>

    <div class="settings-group">
      <h2 class="settings-title">Цвета индикатора</h2>
      <label class="check-row">
        <input type="checkbox" data-field="use_theme_colors" ${p.use_theme_colors ? 'checked' : ''} />
        Брать цвета из текущей темы
      </label>
      <label class="color-row" ${p.use_theme_colors ? 'style="opacity:.45"' : ''}>
        <span>Цвет тика</span>
        <input type="color" value="${esc(p.tick_color)}" data-field="tick_color" ${p.use_theme_colors ? 'disabled' : ''} />
      </label>
      <label class="color-row" ${p.use_theme_colors ? 'style="opacity:.45"' : ''}>
        <span>Цвет паузы</span>
        <input type="color" value="${esc(p.interval_color)}" data-field="interval_color" ${p.use_theme_colors ? 'disabled' : ''} />
      </label>
    </div>

    <div class="settings-group">
      <h2 class="settings-title">О приложении</h2>
      <div class="about-row"><span>Версия</span><b>${APP_VERSION}</b></div>
      <div class="about-row"><span>Таймер тиков</span><b>абсолютный, без дрейфа</b></div>
      <div class="about-row"><span>Тем</span><b>${Object.keys(THEMES).length}</b></div>
      <p class="settings-hint">Данные хранятся локально в браузере/приложении. Пространство — пауза/старт, Esc — закрыть окно.</p>
    </div>
  </section>`;
}

function render() {
  const t = activeTheme();
  root.style.setProperty('--bg0', t.bg0);
  root.style.setProperty('--bg1', t.bg1);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent2', t.accent2);
  root.style.setProperty('--accent3', t.accent3);
  root.style.setProperty('--glow-soft', rgba(t.accent, 0.4));
  // Те же переменные нужны и вне #app (частицы, заставка, тосты)
  const doc = document.documentElement.style;
  doc.setProperty('--bg0', t.bg0);
  doc.setProperty('--bg1', t.bg1);
  doc.setProperty('--accent', t.accent);
  doc.setProperty('--accent2', t.accent2);
  doc.setProperty('--accent3', t.accent3);
  doc.setProperty('--glow-soft', rgba(t.accent, 0.4));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg0);

  main.innerHTML =
    state.activeTab === 'presets' ? renderPresets() : state.activeTab === 'settings' ? renderSettings() : renderCounter();
  renderNav();
  updateMuteButton();
  updateCounter();
  // DOM пересобран — если отсчёт ещё идёт, возвращаем его визуальное состояние
  if (runMode === 'countdown') {
    const box = $('#countdown');
    if (box) {
      box.classList.remove('is-hidden');
      const dial = box.closest('.dial');
      if (dial) dial.classList.add('is-countdown');
      showCountdownNumber(Math.max(1, Math.ceil((cdEndAt - performance.now()) / 1000)));
    }
  }
  persist();
}

function updateMuteButton() {
  const btn = document.querySelector('[data-action="mute"]');
  if (!btn) return;
  btn.innerHTML = icon(state.muted ? 'mute' : 'sound', 16);
  btn.classList.toggle('is-muted', state.muted);
  btn.setAttribute('aria-label', state.muted ? 'Включить звук' : 'Выключить звук');
}

function setTab(tab) {
  if (!['counter', 'presets', 'settings'].includes(tab)) return;
  if (tab !== 'counter') stopRun();
  state.activeTab = tab;
  persist(true);
  render();
}

/* ================= Модальные окна ================= */
function showModal(title, body, actions) {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop">
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-header">
        <h2 class="modal-title">${esc(title)}</h2>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Закрыть">${icon('close', 16)}</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">${actions}</div>
    </section>
  </div>`;
  // Фокус ставим на кнопку, а не на поле ввода, чтобы на телефоне не выскакивала клавиатура
  modalRoot.querySelector('.modal-close')?.focus({ preventScroll: true });
}

function closeModal() {
  modalRoot.innerHTML = '';
}

function openPresetModal(id = null) {
  const existing = id ? state.presets.find((p) => p.id === id) : null;
  const p = existing
    ? { ...existing }
    : {
        ...DEFAULT_PRESET,
        id: '',
        name: `Пресет ${state.presets.length + 1}`,
        interval_ms: activePreset().interval_ms,
        countdown_seconds: activePreset().countdown_seconds,
        sound_name: activePreset().sound_name,
        custom_sounds: []
      };

  const body = `
    <form id="preset-form" data-form="preset" data-id="${esc(existing ? existing.id : '')}"
          style="display:flex;flex-direction:column;gap:15px">
      <label class="form-field">Название
        <input class="text-input" name="name" maxlength="40" required value="${esc(p.name)}" />
      </label>
      <div class="form-grid">
        <label class="form-field">Цель, повторений
          <input class="number-input" type="number" name="total_reps" min="1" max="10000" value="${p.total_reps}" required />
        </label>
        <label class="form-field">Интервал, мс
          <input class="number-input" type="number" name="interval_ms" min="100" max="10000" step="10" value="${p.interval_ms}" required />
        </label>
      </div>
      <div class="form-grid">
        <label class="form-field">Направление
          <select class="select" name="count_up">
            <option value="true" ${p.count_up ? 'selected' : ''}>Возрастание ↑</option>
            <option value="false" ${!p.count_up ? 'selected' : ''}>Убывание ↓</option>
          </select>
        </label>
        <label class="form-field">Отсчёт, сек
          <input class="number-input" type="number" name="countdown_seconds" min="0" max="15" value="${p.countdown_seconds}" />
        </label>
      </div>
      <label class="check-row">
        <input type="checkbox" name="auto_loop" ${p.auto_loop ? 'checked' : ''} /> Автоцикл после цели
      </label>
    </form>`;

  const actions = `
    ${existing ? `<button class="secondary-button danger-button" type="button" data-action="delete-preset" data-id="${esc(existing.id)}">Удалить</button>` : ''}
    <button class="secondary-button" type="button" data-action="close-modal">Отмена</button>
    <button class="primary-button" type="submit" form="preset-form">Сохранить</button>`;

  showModal(existing ? 'Изменить пресет' : 'Новый пресет', body, actions);
}

function showPresetActions(id) {
  const p = state.presets.find((x) => x.id === id);
  if (!p) return;
  const body = `
    <div class="preset-card is-active" style="cursor:default">
      <span class="preset-orb">${p.total_reps}</span>
      <span class="preset-info">
        <span class="preset-name">${esc(p.name)}</span>
        <span class="preset-meta">${fmtIntervalText(p.interval_ms)} · ${p.count_up ? '↑' : '↓'}</span>
      </span>
      <span class="preset-badge">${p.id === state.activePresetId ? 'активен' : ''}</span>
      <span></span>
    </div>
    <button class="secondary-button" type="button" data-action="edit-preset" data-id="${esc(id)}">${icon('edit', 16)} Изменить</button>
    <button class="secondary-button" type="button" data-action="duplicate-preset" data-id="${esc(id)}">${icon('copy', 16)} Создать копию</button>
    <button class="secondary-button" type="button" data-action="select-preset" data-id="${esc(id)}">${icon('check', 16)} Выбрать активным</button>`;
  showModal(p.name, body, `<button class="secondary-button" type="button" data-action="close-modal">Закрыть</button>`);
}

function openThemeModal() {
  const body = `<div class="theme-sheet-grid">${themeCardsMarkup()}</div>`;
  showModal('Тема оформления', body, `<button class="secondary-button" type="button" data-action="close-modal">Готово</button>`);
}

function openSoundModal() {
  const p = activePreset();
  const body = `
    <div class="sound-grid">${soundCardsMarkup(p)}</div>
    <p class="settings-hint">Отклик: ${FEEDBACK_MODES.find((m) => m.id === p.feedback_mode)?.name || 'Звук'}. Полная настройка — на вкладке «Настройки».</p>`;
  showModal('Звук тика', body, `<button class="secondary-button" type="button" data-action="close-modal">Готово</button>`);
}

function handlePresetSubmit(form) {
  const data = new FormData(form);
  const id = form.dataset.id;
  const existing = id ? state.presets.find((p) => p.id === id) : null;
  const next = sanitizePreset({
    ...(existing || DEFAULT_PRESET),
    id: existing ? existing.id : `preset-${Date.now()}`,
    name: String(data.get('name') || 'Пресет').trim().slice(0, 40) || 'Пресет',
    total_reps: clamp(Number(data.get('total_reps')) || 108, 1, 10000),
    interval_ms: clamp(Number(data.get('interval_ms')) || 500, 100, 10000),
    countdown_seconds: clamp(Number(data.get('countdown_seconds')) || 0, 0, 15),
    count_up: data.get('count_up') === 'true',
    auto_loop: !!data.get('auto_loop'),
    custom_sounds: [...((existing && existing.custom_sounds) || [])]
  });

  if (existing) {
    state.presets = state.presets.map((p) => (p.id === existing.id ? next : p));
  } else {
    state.presets.push(next);
    state.activePresetId = next.id;
    state.count = next.count_up ? 0 : next.total_reps;
  }
  stopRun();
  closeModal();
  persist(true);
  render();
  toast(existing ? 'Пресет сохранён' : 'Пресет создан');
}

function duplicatePreset(id) {
  const p = state.presets.find((x) => x.id === id);
  if (!p) return;
  const copy = sanitizePreset({
    ...p,
    id: `preset-${Date.now()}`,
    name: `${p.name} (копия)`.slice(0, 40),
    custom_sounds: [...(p.custom_sounds || [])]
  });
  state.presets.push(copy);
  state.activePresetId = copy.id;
  state.count = copy.count_up ? 0 : copy.total_reps;
  stopRun();
  closeModal();
  persist(true);
  render();
  toast('Копия создана');
}

function deletePreset(id) {
  if (state.presets.length <= 1) {
    toast('Нельзя удалить последний пресет');
    closeModal();
    return;
  }
  state.presets = state.presets.filter((p) => p.id !== id);
  if (state.activePresetId === id) {
    state.activePresetId = state.presets[0].id;
    state.count = 0;
  }
  stopRun();
  closeModal();
  persist(true);
  render();
}

function selectPreset(id) {
  if (!state.presets.some((p) => p.id === id)) return;
  stopRun();
  state.activePresetId = id;
  const p = activePreset();
  state.count = p.count_up ? 0 : p.total_reps;
  state.activeTab = 'counter';
  closeModal();
  persist(true);
  render();
}

/* ================= Поля настроек ================= */
function setField(field, raw, input) {
  const p = activePreset();

  if (field === 'total_reps') {
    p.total_reps = clamp(Math.round(Number(raw) || 108), 1, 10000);
    state.count = Math.min(state.count, p.total_reps);
  } else if (field === 'interval_ms') {
    changeInterval(Number(raw) || 500);
    return;
  } else if (field === 'countdown_seconds') {
    p.countdown_seconds = clamp(Math.round(Number(raw) || 0), 0, 15);
  } else if (field === 'auto_loop') {
    p.auto_loop = !!input.checked;
  } else if (field === 'use_theme_colors') {
    p.use_theme_colors = !!input.checked;
    return;
  } else if (field === 'tick_color' || field === 'interval_color') {
    p[field] = String(raw);
  }
  persist();
}

function updateRangeOutput(input) {
  const line = input.closest('.setting-line');
  if (!line) return;
  const out = line.querySelector('output');
  if (!out) return;
  const field = input.dataset.field;
  if (field === 'interval_ms') out.textContent = fmtIntervalText(Number(input.value));
  else if (field === 'countdown_seconds') out.textContent = `${input.value} с`;
  else out.textContent = input.value;
}

async function importSound(file) {
  if (!file) return;
  if (file.size > 1024 * 1024) {
    toast('Файл слишком большой (максимум 1 МБ)');
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  }).catch(() => null);

  if (!dataUrl) {
    toast('Не удалось прочитать файл');
    return;
  }

  const p = activePreset();
  const base = file.name.replace(/\.[^.]+$/, '').trim() || 'Мой звук';
  let name = base;
  let i = 2;
  while (p.custom_sounds.some((s) => s.name === name)) name = `${base} ${i++}`;
  const previous = p.sound_name;
  p.custom_sounds.push({ name, dataUrl });
  p.sound_name = name;

  if (!safeSave()) {
    p.custom_sounds = p.custom_sounds.filter((s) => s.name !== name);
    p.sound_name = previous;
    render();
    return;
  }
  render();
  toast('Звук добавлен');
}

function safeSave() {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    lastSaveAt = Date.now();
    return true;
  } catch {
    toast('Не удалось сохранить данные');
    return false;
  }
}

/* ================= Частицы фона ================= */
function buildAmbient() {
  const t = activeTheme();
  const colors = [t.accent, t.accent2, t.accent3];
  let html = '';
  for (let i = 0; i < 16; i++) {
    const size = 3 + Math.round(Math.random() * 5);
    html += `<span class="particle" style="left:${(Math.random() * 100).toFixed(1)}%;
      width:${size}px;height:${size}px;background:${colors[i % colors.length]};
      animation-duration:${(14 + Math.random() * 18).toFixed(1)}s;
      animation-delay:-${(Math.random() * 22).toFixed(1)}s"></span>`;
  }
  ambient.innerHTML = html;
}

/* ================= Заставка ================= */
let splashTimer = null;
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash || splash.classList.contains('is-hidden')) return;
  splash.classList.add('is-hidden');
  clearTimeout(splashTimer);
  setTimeout(() => splash.remove(), 700);
}

function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const layer = document.getElementById('splash-particles');
  if (layer) {
    const t = activeTheme();
    const colors = [t.accent, t.accent2, t.accent3, '#ffffff'];
    let html = '';
    for (let i = 0; i < 22; i++) {
      html += `<i style="left:${(Math.random() * 100).toFixed(1)}%;
        background:${colors[i % colors.length]};
        animation-duration:${(6 + Math.random() * 8).toFixed(1)}s;
        animation-delay:-${(Math.random() * 8).toFixed(1)}s"></i>`;
    }
    layer.innerHTML = html;
  }
  splash.addEventListener('click', hideSplash);
  document.getElementById('splash-skip')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideSplash();
  });
  splashTimer = setTimeout(hideSplash, 3000);
}

/* ================= События ================= */
function handleAction(action, el, event) {
  switch (action) {
    case 'toggle-run':
      toggleRun();
      return true;
    case 'tab':
      setTab(el.dataset.tab);
      return true;
    case 'reset':
      resetCount();
      return true;
    case 'direction':
      toggleDirection();
      return true;
    case 'direction-set': {
      const p = activePreset();
      const wantUp = el.dataset.value === 'up';
      if (p.count_up !== wantUp) toggleDirection();
      else render();
      return true;
    }
    case 'interval':
      changeInterval(activePreset().interval_ms + Number(el.dataset.delta || 0));
      updateCounter();
      return true;
    case 'quick-interval':
      changeInterval(Number(el.dataset.ms));
      updateCounter();
      return true;
    case 'mute':
      state.muted = !state.muted;
      persist(true);
      updateMuteButton();
      updateCounter();
      if (!state.muted) playSound(activePreset().sound_name, activePreset().custom_sounds);
      toast(state.muted ? 'Звук выключен' : 'Звук включён');
      return true;
    case 'toggle-loop': {
      const p = activePreset();
      p.auto_loop = !p.auto_loop;
      persist(true);
      updateCounter();
      toast(p.auto_loop ? 'Автоцикл включён' : 'Автоцикл выключен');
      return true;
    }
    case 'open-themes':
      openThemeModal();
      return true;
    case 'theme': {
      state.themeId = el.dataset.theme;
      persist(true);
      buildAmbient();
      render();
      if (modalRoot.firstChild) openThemeModal();
      return true;
    }
    case 'open-sound':
      openSoundModal();
      return true;
    case 'pick-sound': {
      const p = activePreset();
      p.sound_name = el.dataset.sound;
      persist(true);
      playSound(p.sound_name, p.custom_sounds);
      if (modalRoot.firstChild) openSoundModal();
      render();
      return true;
    }
    case 'feedback-set': {
      activePreset().feedback_mode = el.dataset.value;
      persist(true);
      render();
      return true;
    }
    case 'new-preset':
      openPresetModal();
      return true;
    case 'edit-preset':
      closeModal();
      openPresetModal(el.dataset.id);
      return true;
    case 'more-preset':
      showPresetActions(el.dataset.id);
      return true;
    case 'select-preset':
      selectPreset(el.dataset.id);
      return true;
    case 'duplicate-preset':
      duplicatePreset(el.dataset.id);
      return true;
    case 'delete-preset':
      deletePreset(el.dataset.id);
      return true;
    case 'remove-sound': {
      const p = activePreset();
      const name = el.dataset.name;
      p.custom_sounds = p.custom_sounds.filter((s) => s.name !== name);
      if (p.sound_name === name) p.sound_name = 'bowl';
      persist(true);
      render();
      return true;
    }
    case 'close-modal':
      closeModal();
      return true;
    case 'backdrop':
      if (event.target === el) closeModal();
      return true;
    default:
      return false;
  }
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  handleAction(el.dataset.action, el, event);
});

document.addEventListener('submit', (event) => {
  if (event.target.matches('[data-form="preset"]')) {
    event.preventDefault();
    handlePresetSubmit(event.target);
  }
});

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.dataset || !input.dataset.field) return;
  if (input.type === 'range') {
    updateRangeOutput(input);
    setField(input.dataset.field, input.value, input);
    if (state.activeTab === 'counter') updateCounter();
  }
});

document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.dataset && input.dataset.field && input.type !== 'range') {
    setField(input.dataset.field, input.value, input);
    if (state.activeTab === 'settings') render();
    else updateCounter();
    return;
  }
  if (input.dataset && input.dataset.action === 'upload-sound') {
    importSound(input.files && input.files[0]);
    input.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const inField = /INPUT|SELECT|TEXTAREA/.test(tag);

  if (event.key === 'Escape') {
    closeModal();
    return;
  }
  if (modalRoot.firstChild) return; // пока открыто окно — не перехватываем пробел

  if (event.code === 'Space' && !inField && tag !== 'BUTTON') {
    event.preventDefault();
    toggleRun();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('dial')) {
    event.preventDefault();
    toggleRun();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist(true);
    return;
  }
  // Вкладка вернулась в фокус — восстанавливаем точное расписание
  if (runMode === 'running') {
    nextTickAt = performance.now() + engineInterval;
    armTick();
  } else if (runMode === 'countdown') {
    armCountdown();
  }
});

window.addEventListener('pagehide', () => persist(true));
window.addEventListener('beforeunload', () => persist(true));

// Возобновляем звук после первого касания (политика автоплея)
document.addEventListener(
  'pointerdown',
  () => {
    ensureAudio();
  },
  { once: true, passive: true }
);

/* ================= Мост Android ================= */
window.__zenBack = function () {
  if (modalRoot.firstChild) {
    closeModal();
    return true;
  }
  if (state.activeTab !== 'counter') {
    setTab('counter');
    return true;
  }
  if (runMode !== 'idle') {
    stopRun();
    return true;
  }
  return false;
};

/* ================= Тестовый хук ================= */
window.__zen = {
  get mode() {
    return runMode;
  },
  get state() {
    return state;
  },
  get tickLog() {
    return tickLog;
  },
  get interval() {
    return engineInterval;
  },
  version: APP_VERSION,
  start: startRun,
  stop: stopRun,
  setIntervalMs(ms) {
    changeInterval(ms);
    updateCounter();
  },
  setCountdown(seconds) {
    activePreset().countdown_seconds = clamp(Number(seconds) || 0, 0, 15);
    persist(true);
  },
  skipSplash: hideSplash,
  save: () => persist(true),
  setTheme(id) {
    if (THEMES[id]) {
      state.themeId = id;
      persist(true);
      buildAmbient();
      render();
    }
  }
};

/* ================= Старт ================= */
buildAmbient();
render();
initSplash();
window.__zen.ready = true;
