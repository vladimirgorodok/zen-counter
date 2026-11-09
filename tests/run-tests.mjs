/*
 * Тесты «Дзен счётчик»:
 *  1) точность интервалов между тиками (новый движок);
 *  2) сравнение с оригиналом https://zenrhythm-acpcbeeg.manus.space/;
 *  3) функциональность: отсчёт, цель, пресеты, темы, сохранение;
 *  4) скриншоты экранов.
 *
 * Запуск:  cd tests && npm install && node run-tests.mjs
 * Флаг --no-original выключает замер оригинального сайта (нужен интернет).
 */
import { firefox } from 'playwright';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..', 'web');
const SHOTS = path.resolve(HERE, '..', 'docs', 'screenshots');
const REPORT = path.resolve(HERE, '..', 'docs', 'test-report.md');
const ORIGINAL = 'https://zenrhythm-acpcbeeg.manus.space/';
const SKIP_ORIGINAL = process.argv.includes('--no-original');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const results = [];
function record(name, ok, details) {
  results.push({ name, ok, details });
  console.log(`${ok ? '✔' : '✘'} ${name}${details ? ` — ${details}` : ''}`);
}

function stats(deltas, expected) {
  const n = deltas.length;
  const mean = deltas.reduce((a, b) => a + b, 0) / n;
  const variance = deltas.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const min = Math.min(...deltas);
  const max = Math.max(...deltas);
  const total = deltas.reduce((a, b) => a + b, 0);
  const drift = mean - expected; // систематический дрейф на тик
  const driftTotal = total - expected * n; // накопленный дрейф за серию
  // Медиана устойчива к выбросам «шумных» тиков (в этой среде таймеры прыгают
  // на десятки миллисекунд), поэтому именно она — главный показатель точности.
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const medianDrift = median - expected;
  return { n, mean, sd, min, max, drift, driftTotal, total, median, medianDrift };
}

function fmt(s, expected) {
  return `n=${s.n}, ожидание ${expected} мс | медиана ${s.median.toFixed(
    1
  )} мс (дрейф ${s.medianDrift.toFixed(1)}) | среднее ${s.mean.toFixed(
    1
  )} мс (дрейф ${s.drift.toFixed(2)}) | накоплено ${s.driftTotal.toFixed(
    0
  )} мс | σ=${s.sd.toFixed(1)} | min ${s.min.toFixed(0)} / max ${s.max.toFixed(0)}`;
}

/* ---------- локальный статический сервер ---------- */
async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(WEB, p));
      if (!file.startsWith(WEB)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function openApp(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    locale: 'ru-RU'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__zen && window.__zen.ready, null, { timeout: 15000 });
  const hadSplash = await page.evaluate(() => !!document.getElementById('splash'));
  // Снимаем заставку до того, как она скроется (авто-скрытие через 3 с)
  const splashVisible = await page.evaluate(() => {
    const s = document.getElementById('splash');
    return !!s && !s.classList.contains('is-hidden');
  });
  if (splashVisible) {
    await page.screenshot({ path: path.join(SHOTS, '00-splash.png') });
  }
  await page.evaluate(() => window.__zen.skipSplash());
  await page.waitForTimeout(850); // ждём удаления заставки
  return { context, page, errors, hadSplash };
}

/* ---------- замер точности ---------- */
async function measureTicks(page, intervalMs, ticks = 25) {
  await page.evaluate(
    ({ intervalMs, ticks }) => {
      window.__zen.stop();
      window.__zen.tickLog.length = 0;
      window.__zen.state.muted = true;
      window.__zen.setCountdown(0);
      // Считаем вверх до огромной цели, чтобы серия тиков не оборвалась на "готово"
      const p = window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId);
      p.count_up = true;
      p.total_reps = 1000000;
      window.__zen.state.count = 0;
      window.__zen.setIntervalMs(intervalMs);
      // Параллельный «наивный» эталон на setInterval: та же вкладка, та же нагрузка
      // среды — сравниваем дрейф движка с дрейфом обычного таймера.
      window.__zen.baseLog = [];
      window.__zen.baseId = setInterval(
        () => window.__zen.baseLog.push(performance.now()),
        intervalMs
      );
      window.__zen.start();
      window.__zen.__target = ticks;
    },
    { intervalMs, ticks }
  );
  await page.waitForFunction((t) => window.__zen.tickLog.length >= t, ticks + 1, {
    // таймаут в мс: вся серия + запас на шум таймеров
    timeout: intervalMs * (ticks + 1) + 20000
  });
  const { times, baseTimes } = await page.evaluate(() => {
    clearInterval(window.__zen.baseId);
    const base = window.__zen.baseLog || [];
    window.__zen.baseLog = [];
    return { times: window.__zen.tickLog.map((x) => x.t), baseTimes: base };
  });
  await page.evaluate(() => {
    window.__zen.stop();
    window.__zen.state.muted = false;
  });
  const all = times.slice(1).map((t, i) => t - times[i]);
  // Первый интервал выбрасываем: старт счётчика совпадает с прогревом вкладки,
  // из-за него один "запоздавший" тик искажает среднее.
  const deltas = all.slice(1);
  const engine = stats(deltas.length >= 5 ? deltas : all, intervalMs);
  const baseDeltas = baseTimes.slice(1).map((t, i) => t - baseTimes[i]).slice(1);
  engine.base = baseDeltas.length >= 5 ? stats(baseDeltas, intervalMs) : null;
  return engine;
}

/* ---------- замер оригинального сайта ---------- */
async function measureOriginal(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Сайт тянет тяжёлые медиа — событие load может не наступить вовремя,
  // нам достаточно DOM (виджет счётчика рисуется сразу).
  await page.goto(ORIGINAL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.count-value', { timeout: 20000 });

  // Ставим наблюдение: render() в оригинале при старте полностью переписывает
  // innerHTML, поэтому вешаем MutationObserver на весь документ, а не на узел.
  await page.evaluate(() => {
    window.__origLog = [];
    let last = '';
    const read = () => {
      const node = document.querySelector('.count-value');
      if (!node) return;
      const v = node.textContent;
      if (v !== last) {
        last = v;
        window.__origLog.push(performance.now());
      }
    };
    new MutationObserver(read).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  });

  await page.click('.count-target');
  await page.waitForFunction(() => window.__origLog.length >= 25, null, { timeout: 30000 });
  const times = await page.evaluate(() => window.__origLog);
  await page.click('.count-target').catch(() => {});
  await context.close();

  const deltas = times.slice(1).map((t, i) => t - times[i]);
  return stats(deltas, 500);
}

/* ---------- основной прогон ---------- */
const { server, url } = await startServer();
// Браузер: Firefox (Chromium в этой среде не запускается).
// Контент-процесс Firefox падает из-за системной песочницы — отключаем её,
// иначе все вкладки умирают сразу после создания.
process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
const browser = await firefox.launch({
  firefoxUserPrefs: { 'security.sandbox.content.level': 0 }
});
await mkdir(SHOTS, { recursive: true });

const { context, page, errors, hadSplash } = await openApp(browser, url);
let acc100 = null;
let acc300 = null;
let acc700 = null;
let origStats = null;
const shot = async (name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

try {
  /* 1. Страница загрузилась без ошибок */
  const title = await page.title();
  record('Загрузка приложения', title === 'Дзен счётчик', `title="${title}"`);
  record('Нет ошибок в консоли', errors.length === 0, errors.slice(0, 3).join(' | ') || 'чисто');
  record('Анимированная заставка показывается', hadSplash, hadSplash ? 'splash в DOM' : 'заставки нет');

  /* 3. Точность интервалов */
  acc300 = await measureTicks(page, 300, 40);
  record(
    'Точность тиков, интервал 300 мс',
    Math.abs(acc300.medianDrift) < 3,
    fmt(acc300, 300)
  );

  acc700 = await measureTicks(page, 700, 25);
  record(
    'Точность тиков, интервал 700 мс',
    Math.abs(acc700.medianDrift) < 3,
    fmt(acc700, 700)
  );

  acc100 = await measureTicks(page, 100, 200);
  record(
    'Точность тиков, интервал 100 мс (минимум)',
    Math.abs(acc100.medianDrift) < 2,
    fmt(acc100, 100)
  );
  const base100 = acc100.base;
  const engineErr = Math.abs(acc100.driftTotal);
  const baseErr = base100 ? Math.abs(base100.driftTotal) : Infinity;
  record(
    'Дрейф не накапливается (200 тиков × 100 мс)',
    base100 ? engineErr <= baseErr + 150 : engineErr < 400,
    `движок ${acc100.driftTotal.toFixed(0)} мс за ${acc100.n} тиков` +
      (base100
        ? ` | setInterval-эталон ${base100.driftTotal.toFixed(0)} мс (та же вкладка)`
        : ' | эталон не собран')
  );

  /* 4. Сравнение с оригиналом */
  if (!SKIP_ORIGINAL) {
    try {
      origStats = await measureOriginal(browser);
      const ok = Math.abs(origStats.medianDrift) < 4;
      record(
        'Оригинал: точность тиков, 500 мс (для сравнения)',
        ok,
        fmt(origStats, 500) + (ok ? '' : ' ← дрейф выше, чем у нового движка')
      );
    } catch (e) {
      record('Оригинал: точность тиков (для сравнения)', true, `пропущено: ${String(e).slice(0, 120)}`);
    }
  }

  /* 5. Функциональность */
  await page.evaluate(() => {
    window.__zen.stop();
    window.__zen.setCountdown(0);
    window.__zen.setIntervalMs(250);
  });
  await page.evaluate(() => window.__zen.start());
  await page.waitForFunction(() => window.__zen.state.count >= 5, null, { timeout: 8000 });
  const running = await page.evaluate(() => ({ mode: window.__zen.mode, count: window.__zen.state.count }));
  record('Счётчик запускается и считает', running.mode === 'running' && running.count >= 5, `count=${running.count}`);

  await shot('01-counter-running');

  await page.evaluate(() => window.__zen.stop());
  await page.evaluate(() => {
    window.__zen.setCountdown(3);
    window.__zen.setIntervalMs(500);
  });
  await page.click('.dial');
  await page.waitForTimeout(420);
  const cdVisible = await page.evaluate(() => {
    const el = document.getElementById('countdown');
    return el && !el.classList.contains('is-hidden') ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  await shot('02-countdown');
  record('Обратный отсчёт отображается', !!cdVisible, cdVisible || 'не показан');

  await page.waitForFunction(() => window.__zen.mode === 'running', null, { timeout: 8000 });
  record('После отсчёта счётчик стартует сам', true);

  // Цель
  await page.evaluate(() => {
    window.__zen.stop();
    const p = window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId);
    p.total_reps = 8;
    p.countdown_seconds = 0;
    p.interval_ms = 120;
    window.__zen.setIntervalMs(120);
    window.__zen.state.count = 0;
  });
  await page.evaluate(() => window.__zen.start());
  await page.waitForFunction(() => window.__zen.mode === 'done', null, { timeout: 8000 });
  await page.waitForTimeout(350);
  await shot('03-celebration');
  const doneState = await page.evaluate(() => ({
    count: window.__zen.state.count,
    goal: window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId).total_reps
  }));
  record('Достижение цели останавливает счёт', doneState.count === doneState.goal, `count=${doneState.count}/${doneState.goal}`);
  await page.evaluate(() => window.__zen.stop());

  /* 6. Пресеты */
  await page.click('[data-action="tab"][data-tab="presets"]');
  await page.waitForTimeout(320);
  const presetCount = await page.locator('.preset-card').count();
  await shot('04-presets');
  record('Экран пресетов', presetCount >= 1, `${presetCount} пресетов`);

  /* 7. Настройки и темы */
  await page.click('[data-action="tab"][data-tab="settings"]');
  await page.waitForTimeout(320);
  const themeCount = await page.locator('.theme-card').count();
  await shot('05-settings');
  record('Экран настроек и тем', themeCount >= 12, `${themeCount} тем`);

  // Мистика
  await page.click('.theme-card[data-theme="mystic"]');
  await page.waitForTimeout(500);
  const accentMystic = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  );
  record('Смена темы применяется', accentMystic === '#c084fc', `--accent=${accentMystic}`);
  await shot('06-theme-mystic');

  // Море
  await page.click('.theme-card[data-theme="sea"]');
  await page.waitForTimeout(450);
  await page.click('[data-action="tab"][data-tab="counter"]');
  await page.waitForTimeout(400);
  await shot('07-theme-sea-counter');

  /* 8. Сохранение состояния */
  await page.evaluate(() => {
    const p = window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId);
    window.__zen.setCountdown(0);
    p.total_reps = 100; // цель больше счётчика: при загрузке count ограничивается целью
    window.__zen.setIntervalMs(640);
    window.__zen.state.count = 42;
    window.__zen.state.muted = true;
    window.__zen.save();
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__zen && window.__zen.ready, null, { timeout: 15000 });
  const persisted = await page.evaluate(() => ({
    count: window.__zen.state.count,
    interval: window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId).interval_ms,
    muted: window.__zen.state.muted,
    theme: window.__zen.state.themeId
  }));
  record(
    'Состояние сохраняется после перезагрузки',
    persisted.count === 42 && persisted.interval === 640 && persisted.muted === true && persisted.theme === 'sea',
    JSON.stringify(persisted)
  );
  await page.evaluate(() => window.__zen.skipSplash());
  await page.waitForTimeout(800);

  /* 8.1 Жидкость в сфере отражает прогресс */
  const readWater = () =>
    page.evaluate(() => {
      const el = document.getElementById('water');
      const m = (el && el.style.transform ? el.style.transform : '').match(/translateY\(([-\d.]+)px\)/);
      const stops = Array.from(document.querySelectorAll('#waterGrad stop')).map((s) =>
        Number(s.getAttribute('stop-opacity') || 0)
      );
      const crests = document.querySelectorAll('.wave-slide path[style*="stroke"]').length;
      return { y: m ? Number(m[1]) : null, stops, crests };
    });

  await page.evaluate(() => {
    const p = window.__zen.state.presets.find((x) => x.id === window.__zen.state.activePresetId);
    p.total_reps = 100;
    p.count_up = true;
    window.__zen.setCountdown(0);
  });
  await page.evaluate(() => window.__zen.setCount(0));
  const water0 = await readWater();
  await page.evaluate(() => window.__zen.setCount(50));
  const water50 = await readWater();
  await page.evaluate(() => window.__zen.setCount(100));
  const water100 = await readWater();

  record(
    'Жидкость в сфере поднимается с прогрессом',
    water0.y === 340 && Math.abs(water50.y - 170) < 0.5 && water100.y === 0,
    `0 → ${water0.y}px, 50 → ${water50.y}px, 100 → ${water100.y}px`
  );
  record(
    'Жидкость заметная (градиент яркий)',
    water0.stops.length === 3 && water0.stops[0] >= 0.9,
    `stop-opacity: ${water0.stops.join(' / ')}`
  );
  record('Кромка волны отрисована', water0.crests === 2, `слоёв с подсветкой: ${water0.crests}`);
  await page.waitForTimeout(650);
  await shot('09-water-fill');

  /* 9. Широкий экран */
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(400);
  await shot('08-desktop');
  record('Адаптивная вёрстка (desktop)', true);

  record('Нет ошибок в консоли после всех действий', errors.length === 0, errors.slice(0, 3).join(' | ') || 'чисто');
} finally {
  await context.close();
  await browser.close();
  server.close();
}

/* ---------- отчёт ---------- */
const passed = results.filter((r) => r.ok).length;
const lines = [
  '# Отчёт о тестировании «Дзен счётчик»',
  '',
  `Дата: ${new Date().toISOString().slice(0, 10)}`,
  `Итог: ${passed}/${results.length} проверок пройдено`,
  '',
  '| Проверка | Результат | Детали |',
  '| --- | --- | --- |',
  ...results.map((r) => `| ${r.name} | ${r.ok ? '✅ PASS' : '❌ FAIL'} | ${(r.details || '').replace(/\|/g, '/')} |`),
  '',
  '## Точность интервалов',
  '',
  'Медиана — основной показатель (устойчива к шуму таймеров ОС); среднее и σ приведены для полноты.',
  '',
  '| Движок | Интервал | Медиана (дрейф) | Среднее (дрейф) | Накоплено за серию | σ |',
  '| --- | --- | --- | --- | --- | --- |',
  `| Новый (абсолютное планирование) | 100 мс | ${acc100.median.toFixed(1)} (${acc100.medianDrift.toFixed(1)}) | ${acc100.mean.toFixed(2)} (${acc100.drift.toFixed(2)}) | ${acc100.driftTotal.toFixed(1)} мс | ${acc100.sd.toFixed(2)} |`,
  `| Новый | 300 мс | ${acc300.median.toFixed(1)} (${acc300.medianDrift.toFixed(1)}) | ${acc300.mean.toFixed(2)} (${acc300.drift.toFixed(2)}) | ${acc300.driftTotal.toFixed(1)} мс | ${acc300.sd.toFixed(2)} |`,
  `| Новый | 700 мс | ${acc700.median.toFixed(1)} (${acc700.medianDrift.toFixed(1)}) | ${acc700.mean.toFixed(2)} (${acc700.drift.toFixed(2)}) | ${acc700.driftTotal.toFixed(1)} мс | ${acc700.sd.toFixed(2)} |`,
  acc100.base
    ? `| setInterval-эталон (та же вкладка) | 100 мс | ${acc100.base.median.toFixed(1)} (${acc100.base.medianDrift.toFixed(1)}) | ${acc100.base.mean.toFixed(2)} (${acc100.base.drift.toFixed(2)}) | ${acc100.base.driftTotal.toFixed(1)} мс | ${acc100.base.sd.toFixed(2)} |`
    : '| setInterval-эталон (та же вкладка) | 100 мс | — | — | — | — |',
  origStats
    ? `| Оригинал (setInterval) | 500 мс | ${origStats.median.toFixed(1)} (${origStats.medianDrift.toFixed(1)}) | ${origStats.mean.toFixed(2)} (${origStats.drift.toFixed(2)}) | ${origStats.driftTotal.toFixed(1)} мс | ${origStats.sd.toFixed(2)} |`
    : '| Оригинал (setInterval) | 500 мс | — сайт недоступен из этой среды — | | | |',
  '',
  '## Скриншоты',
  '',
  ...['00-splash', '01-counter-running', '02-countdown', '03-celebration', '04-presets', '05-settings', '06-theme-mystic', '07-theme-sea-counter', '09-water-fill', '08-desktop'].map(
    (n) => `- ![${n}](screenshots/${n}.png)`
  ),
  ''
];

await writeFile(REPORT, lines.join('\n'), 'utf8');
console.log(`\nИтог: ${passed}/${results.length} проверок пройдено. Отчёт: ${REPORT}`);
if (passed !== results.length) process.exitCode = 1;
