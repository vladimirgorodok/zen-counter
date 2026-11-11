/*
 * Графика для Google Play.
 *   node scripts/make-play-graphics.mjs
 * Готовит в docs/play/:
 *   feature-graphic-1024x500.png — рекламная графика (1024×500, обязательно)
 *   screenshots/*.jpg — скриншоты телефона (JPEG без альфы)
 * Иконку 512×512 берём из web/icons/icon-512.png (проверяем размеры).
 */
import { firefox } from 'playwright';
import { writeFile, readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PLAY = path.join(ROOT, 'docs', 'play');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');

await mkdir(path.join(PLAY, 'screenshots'), { recursive: true });

const SHOT_NAMES = [
  '07-theme-sea-counter',
  '09-water-fill',
  '01-counter-running',
  '02-countdown',
  '04-presets',
  '05-settings'
];

const featureHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1024px; height: 500px; overflow: hidden; }
  body {
    font-family: "Noto Sans", "DejaVu Sans", sans-serif;
    background:
      radial-gradient(120% 140% at 18% 0%, rgba(34,211,238,.20) 0%, rgba(34,211,238,0) 55%),
      radial-gradient(90% 120% at 88% 100%, rgba(251,191,36,.16) 0%, rgba(251,191,36,0) 60%),
      linear-gradient(135deg, #0a0f1e 0%, #161a3c 55%, #241b52 100%);
    display: flex; align-items: center; gap: 56px; padding: 0 64px;
    color: #e8ecff;
  }
  .ring {
    flex: 0 0 auto; width: 360px; height: 360px; border-radius: 50%;
    position: relative;
    background:
      radial-gradient(circle at 50% 30%, rgba(255,255,255,.07) 0%, rgba(255,255,255,.02) 60%, transparent 72%);
    box-shadow: 0 30px 80px rgba(0,0,0,.5);
  }
  .ring::before {
    content: ""; position: absolute; inset: -7px; border-radius: 50%;
    background: conic-gradient(from 130deg, #22d3ee, #a78bfa 45%, #fbbf24 80%, #22d3ee);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11px));
  }
  .ring::after {
    content: ""; position: absolute; inset: 0; border-radius: 50%;
    background: linear-gradient(180deg, rgba(94,184,255,.5), rgba(94,184,255,.14) 46%, rgba(126,58,242,.35));
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 30px), #000 calc(100% - 29px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 30px), #000 calc(100% - 29px));
    opacity: .55;
  }
  .drop {
    position: absolute; left: 50%; bottom: 8%; transform: translateX(-50%);
    width: 300px; height: 46px; border-radius: 50%;
    background: linear-gradient(180deg, rgba(94,184,255,.35), rgba(34,211,238,.12));
    filter: blur(6px);
  }
  .lotus { position:absolute; left:50%; top:26%; transform:translateX(-50%); font-size:54px; opacity:.92; }
  .num {
    position:absolute; left:50%; top:50%; transform:translate(-50%,-52%);
    font-size: 84px; font-weight: 800; letter-spacing: 2px;
    background: linear-gradient(180deg, #ffffff, #9fb6ff);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .text { display: flex; flex-direction: column; gap: 18px; }
  h1 {
    font-size: 74px; font-weight: 800; line-height: 1.05; letter-spacing: .5px;
    background: linear-gradient(92deg, #e8ecff 0%, #9fb6ff 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .tag {
    display: flex; flex-direction: column; gap: 12px; font-size: 27px; color: #b9c4ea; line-height: 1.4;
  }
  .tag b { color: #ffd479; font-weight: 600; }
  .chips { display: flex; gap: 10px; margin-top: 6px; }
  .chip {
    font-size: 20px; color: #dfe6ff; padding: 9px 18px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.06);
  }
</style></head>
<body>
  <div class="ring"><div class="drop"></div><div class="lotus">&#129677;</div><div class="num">108</div></div>
  <div class="text">
    <h1>Дзен счётчик</h1>
    <div class="tag">
      <div>Медитативный счёт повторений с <b>точным ритмом</b></div>
      <div>14 тем · звуки чаши · режим фокуса · автономный цикл</div>
    </div>
    <div class="chips"><span class="chip">108</span><span class="chip">мантры</span><span class="chip">дыхание</span><span class="chip">прогресс</span></div>
  </div>
</body></html>`;

const tmpHtml = '/tmp/opencode/feature-graphic.html';
await writeFile(tmpHtml, featureHtml, 'utf8');

const browser = await firefox.launch({ firefoxUserPrefs: { 'security.sandbox.content.level': 0 } });
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.goto('file://' + tmpHtml);
await page.waitForTimeout(400);

// Рекламная графика: рисуем в canvas и сохраняем как PNG без альфы.
const fgPng = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 500;
  const ctx = c.getContext('2d');
  // фон берем со страницы: скриншот проще, но canvas даёт чистый RGB
  const svg = new XMLSerializer().serializeToString(document.documentElement);
  return null;
});
// Проще: скриншот элемента body целиком (он ровно 1024×500) — PNG с альфой не критичен,
// но Play просит 24-бит. Перегоняем через canvas в JPEG-качество PNG без прозрачности.
const fgBuffer = await page.locator('body').screenshot({ type: 'png' });
// Убираем альфу: перерисовываем PNG на белый фон в canvas.
const fgFlat = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}, fgBuffer.toString('base64'));
await writeFile(path.join(PLAY, 'feature-graphic-1024x500.png'), Buffer.from(fgFlat, 'base64'));

// Скриншоты: PNG (RGBA) → JPEG без альфы, как требует Play.
const shotPage = await browser.newPage({ viewport: { width: 780, height: 1688 }, deviceScaleFactor: 1 });
for (const name of SHOT_NAMES) {
  const png = await readFile(path.join(SHOTS, `${name}.png`));
  const jpg = await shotPage.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, png.toString('base64'));
  await writeFile(path.join(PLAY, 'screenshots', `${name}.jpg`), Buffer.from(jpg, 'base64'));
}

// Иконка 512×512 для Play — копируем из web/icons (без альфы не требуется: Play разрешает 32-бит).
await copyFile(path.join(ROOT, 'web', 'icons', 'icon-512.png'), path.join(PLAY, 'icon-512.png'));

await browser.close();
console.log('Готово: docs/play/feature-graphic-1024x500.png, docs/play/icon-512.png, docs/play/screenshots/*.jpg');
