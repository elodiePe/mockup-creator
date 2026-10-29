// mockup.lab — one canvas renderer drives both the live preview and the PNG export,
// so what you see is exactly what you download.

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const EXPORT_SCALE = 2;
const formats = {
  square: { width: 1200, height: 1200, label: '1200 × 1200 px' },
  portrait: { width: 1200, height: 1500, label: '1200 × 1500 px' },
  story: { width: 1080, height: 1920, label: '1080 × 1920 px' },
  landscape: { width: 1600, height: 900, label: '1600 × 900 px' }
};
const DEFAULT_COLOR = '#f2a187';

// Natural (unscaled) device sizes, in layout units.
const PHONE = { w: 272, h: 560, radius: 46 };
const LAPTOP = { w: 1000, h: 561 };
const MONITOR = { w: 1000, h: 796 };
const NATURAL = { phone: PHONE, desktop: LAPTOP, monitor: MONITOR };
const EDGE = { phone: '#2a2c30', desktop: '#a3a6ab', monitor: '#9da0a5' };
const LABELS = { phone: 'Phone', desktop: 'Laptop', monitor: 'Big screen' };
const GRADIENTS = [
  { name: 'Sunset', stops: ['#ffe8dc', '#f49a7b'] },
  { name: 'Aurora', stops: ['#a7ffeb', '#5b8def', '#9b5cff'] },
  { name: 'Cyber', stops: ['#12062b', '#5b1bb5', '#ff3cac'] },
  { name: 'Bubblegum', stops: ['#ffd1f0', '#c3a6ff', '#8fe3ff'] },
  { name: 'Lime fizz', stops: ['#f6ffb0', '#6df0a5', '#0fb5ae'] },
  { name: 'Midnight', stops: ['#0b1020', '#1d2b64', '#3a6ea5'] }
];

const defaultStatus = () => ({ on: true, time: '09:41', battery: 80, notifs: 1, autoBg: true, bg: '#111111' });

const newDevice = (id, type) => ({
  id, type, scale: 100, rotation: type === 'phone' && id === 1 ? -4 : 0, x: 0, y: 0,
  depth: 0, tilt: 0, landscape: false, barLight: null, barColor: null, image: null, fileName: ''
});

// Natural size of a device in layout units, honouring orientation.
function dimsOf(device) {
  const n = NATURAL[device.type];
  return device.landscape && device.type === 'phone' ? { w: n.h, h: n.w } : { w: n.w, h: n.h };
}

const state = {
  background: 'gradient',
  gradient: 0,
  status: defaultStatus(),
  color: DEFAULT_COLOR,
  format: 'portrait',
  backgroundImage: null,
  selectedId: 1,
  nextId: 2,
  devices: [newDevice(1, 'phone')]
};

const $ = (selector) => document.querySelector(selector);
const canvas = $('#previewCanvas');
const canvasWrap = $('#canvasWrap');
const ctx = canvas.getContext('2d');
const fileInput = $('#fileInput');
const backgroundInput = $('#backgroundInput');
const dropzone = $('#dropzone');
const toast = $('#toast');

let placements = []; // last computed layout, used for hit-testing

function selectedDevice() {
  return state.devices.find((device) => device.id === state.selectedId) || state.devices[0];
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    image.src = url;
  });
}

/* ---------- Drawing primitives ---------- */

function pathRoundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function drawCover(c, image, x, y, w, h) {
  const ratio = image.naturalWidth / image.naturalHeight;
  const target = w / h;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (ratio > target) { sw = sh * target; sx = (image.naturalWidth - sw) / 2; }
  else { sh = sw / target; sy = (image.naturalHeight - sh) / 2; }
  c.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function drawPlaceholder(c, x, y, w, h, dark, label) {
  const gradient = c.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, dark ? '#2b3447' : '#eef1f5');
  gradient.addColorStop(1, dark ? '#10131b' : '#c9d2de');
  c.fillStyle = gradient;
  c.fillRect(x, y, w, h);
  if (!label) return;
  c.fillStyle = dark ? 'rgba(255,255,255,.7)' : 'rgba(23,33,43,.55)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `500 ${Math.round(Math.min(w, h) * .075)}px 'DM Sans', sans-serif`;
  c.fillText('＋', x + w / 2, y + h / 2 - h * .04);
  c.font = `500 ${Math.round(Math.min(w, h) * .05)}px 'DM Sans', sans-serif`;
  c.fillText('Upload a screenshot', x + w / 2, y + h / 2 + h * .05);
}

function drawGlare(c, x, y, w, h) {
  const glare = c.createLinearGradient(x, y, x + w * .9, y + h * .75);
  glare.addColorStop(0, 'rgba(255,255,255,.13)');
  glare.addColorStop(.38, 'rgba(255,255,255,.03)');
  glare.addColorStop(.39, 'rgba(255,255,255,0)');
  c.fillStyle = glare;
  c.fillRect(x, y, w, h);
}

/* ---------- Devices (drawn around their own origin, top-left = 0,0) ---------- */

function phoneSilhouette(c) {
  pathRoundRect(c, 0, 0, PHONE.w, PHONE.h, PHONE.radius);
}

function drawPhone(c, device, shadow, preview) {
  const { w, h, radius } = PHONE;

  c.save();
  c.shadowColor = shadow.on ? 'rgba(20, 25, 30, .38)' : 'rgba(0,0,0,0)';
  c.shadowBlur = shadow.blur;
  c.shadowOffsetY = shadow.offset;
  c.fillStyle = '#26282c';
  phoneSilhouette(c);
  c.fill();
  c.restore();

  // Side buttons
  const button = c.createLinearGradient(-4, 0, 1, 0);
  button.addColorStop(0, '#16171a');
  button.addColorStop(1, '#5a5d63');
  c.fillStyle = button;
  [[96, 28], [150, 54], [216, 54]].forEach(([y, bh]) => { pathRoundRect(c, -3, y, 5, bh, 2); c.fill(); });
  const power = c.createLinearGradient(w - 1, 0, w + 4, 0);
  power.addColorStop(0, '#5a5d63');
  power.addColorStop(1, '#16171a');
  c.fillStyle = power;
  pathRoundRect(c, w - 2, 190, 5, 86, 2);
  c.fill();

  // Metal frame
  const frame = c.createLinearGradient(0, 0, w, 0);
  [[0, '#8a8d92'], [.04, '#33353a'], [.5, '#1e2023'], [.96, '#33353a'], [1, '#8a8d92']].forEach(([o, col]) => frame.addColorStop(o, col));
  c.fillStyle = frame;
  phoneSilhouette(c);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.28)';
  c.lineWidth = 1.5;
  pathRoundRect(c, .75, .75, w - 1.5, h - 1.5, radius - .75);
  c.stroke();

  // Glass bezel + screen
  c.fillStyle = '#000';
  pathRoundRect(c, 5, 5, w - 10, h - 10, radius - 5);
  c.fill();

  const inset = 11;
  const sx = inset;
  const sy = inset;
  const sw = w - inset * 2;
  const sh = h - inset * 2;
  c.save();
  pathRoundRect(c, sx, sy, sw, sh, radius - inset);
  c.clip();
  drawScreen(c, device, sx, sy, sw, sh, false, preview);
  drawGlare(c, sx, sy, sw, sh);
  if (!device.landscape) drawStatusBar(c, 'phone', device, sx, sy, sw);
  c.restore();

  // Dynamic island
  c.fillStyle = '#000';
  pathRoundRect(c, w / 2 - 44, 15, 88, 26, 13);
  c.fill();
  c.fillStyle = '#10151f';
  c.beginPath();
  c.arc(w / 2 + 28, 28, 5, 0, Math.PI * 2);
  c.fill();
}

function drawLaptop(c, device, shadow, preview) {
  const lid = { x: 80, y: 0, w: 840, h: 535 };
  const base = { x: 46, y: 535, w: 908, h: 26 };

  // One shadow for the whole silhouette
  c.save();
  c.shadowColor = shadow.on ? 'rgba(20, 25, 30, .4)' : 'rgba(0,0,0,0)';
  c.shadowBlur = shadow.blur;
  c.shadowOffsetY = shadow.offset;
  c.fillStyle = '#b9bcc0';
  pathRoundRect(c, lid.x, lid.y, lid.w, lid.h, [26, 26, 0, 0]);
  c.fill();
  pathRoundRect(c, base.x, base.y, base.w, base.h, [3, 3, 26, 26]);
  c.fill();
  c.restore();

  // Lid (aluminium rim)
  const rim = c.createLinearGradient(0, 0, 0, lid.h);
  rim.addColorStop(0, '#e4e6e9');
  rim.addColorStop(1, '#b9bcc1');
  c.fillStyle = rim;
  pathRoundRect(c, lid.x, lid.y, lid.w, lid.h, [26, 26, 0, 0]);
  c.fill();

  // Black glass + screen (16:10)
  c.fillStyle = '#050506';
  pathRoundRect(c, lid.x + 4, 4, lid.w - 8, lid.h - 4, [22, 22, 0, 0]);
  c.fill();
  const sx = 94;
  const sy = 14;
  const sw = 812;
  const sh = 507;
  c.save();
  pathRoundRect(c, sx, sy, sw, sh, 8);
  c.clip();
  drawScreen(c, device, sx, sy, sw, sh, true, preview);
  drawGlare(c, sx, sy, sw, sh);
  drawStatusBar(c, 'desktop', device, sx, sy, sw);
  c.restore();

  // Notch + camera
  c.fillStyle = '#050506';
  pathRoundRect(c, 500 - 62, 4, 124, 26, [0, 0, 10, 10]);
  c.fill();
  c.fillStyle = '#10151f';
  c.beginPath();
  c.arc(500, 15, 3.5, 0, Math.PI * 2);
  c.fill();

  // Base slab
  const slab = c.createLinearGradient(0, base.y, 0, base.y + base.h);
  slab.addColorStop(0, '#eceef0');
  slab.addColorStop(.3, '#d3d6da');
  slab.addColorStop(1, '#a9acb1');
  c.fillStyle = slab;
  pathRoundRect(c, base.x, base.y, base.w, base.h, [3, 3, 26, 26]);
  c.fill();
  const ends = c.createLinearGradient(base.x, 0, base.x + base.w, 0);
  ends.addColorStop(0, 'rgba(0,0,0,.28)');
  ends.addColorStop(.05, 'rgba(0,0,0,0)');
  ends.addColorStop(.95, 'rgba(0,0,0,0)');
  ends.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = ends;
  pathRoundRect(c, base.x, base.y, base.w, base.h, [3, 3, 26, 26]);
  c.fill();
  // hinge line under the lid
  c.fillStyle = 'rgba(0,0,0,.45)';
  c.fillRect(lid.x, 535, lid.w, 2);
  // opening notch
  const notch = c.createLinearGradient(0, base.y, 0, base.y + 11);
  notch.addColorStop(0, '#8d9095');
  notch.addColorStop(1, '#d7d9dc');
  c.fillStyle = notch;
  c.beginPath();
  c.moveTo(430, base.y);
  c.quadraticCurveTo(436, base.y + 11, 452, base.y + 11);
  c.lineTo(548, base.y + 11);
  c.quadraticCurveTo(564, base.y + 11, 570, base.y);
  c.closePath();
  c.fill();
}

function monitorSilhouette(c) {
  pathRoundRect(c, 0, 0, 1000, 640, [20, 20, 14, 14]);
  c.fill();
  c.beginPath();
  c.moveTo(440, 630); c.lineTo(560, 630); c.lineTo(580, 785); c.lineTo(420, 785);
  c.closePath();
  c.fill();
  pathRoundRect(c, 330, 776, 340, 20, [6, 6, 10, 10]);
  c.fill();
}

function drawMonitor(c, device, shadow, preview) {
  const panel = { w: 1000, h: 640 };
  c.save();
  c.shadowColor = shadow.on ? 'rgba(20, 25, 30, .4)' : 'rgba(0,0,0,0)';
  c.shadowBlur = shadow.blur;
  c.shadowOffsetY = shadow.offset;
  c.fillStyle = '#b9bcc0';
  monitorSilhouette(c);
  c.restore();

  // Stand
  const neck = c.createLinearGradient(420, 0, 580, 0);
  neck.addColorStop(0, '#9a9da2');
  neck.addColorStop(.4, '#e6e8ea');
  neck.addColorStop(1, '#8d9095');
  c.fillStyle = neck;
  c.beginPath();
  c.moveTo(440, 630); c.lineTo(560, 630); c.lineTo(580, 785); c.lineTo(420, 785);
  c.closePath();
  c.fill();
  const foot = c.createLinearGradient(0, 776, 0, 796);
  foot.addColorStop(0, '#eceef0');
  foot.addColorStop(1, '#a3a6ab');
  c.fillStyle = foot;
  pathRoundRect(c, 330, 776, 340, 20, [6, 6, 10, 10]);
  c.fill();

  // Panel
  const alu = c.createLinearGradient(0, 0, 0, panel.h);
  alu.addColorStop(0, '#eceef0');
  alu.addColorStop(1, '#c3c6ca');
  c.fillStyle = alu;
  pathRoundRect(c, 0, 0, panel.w, panel.h, [20, 20, 14, 14]);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.7)';
  c.lineWidth = 1.5;
  pathRoundRect(c, .75, .75, panel.w - 1.5, panel.h - 1.5, [19, 19, 13, 13]);
  c.stroke();
  c.fillStyle = '#050506';
  pathRoundRect(c, 12, 12, 976, 560, 10);
  c.fill();
  const sx = 24;
  const sy = 24;
  const sw = 952;
  const sh = 536;
  c.save();
  pathRoundRect(c, sx, sy, sw, sh, 4);
  c.clip();
  drawScreen(c, device, sx, sy, sw, sh, true, preview);
  drawGlare(c, sx, sy, sw, sh);
  drawStatusBar(c, 'monitor', device, sx, sy, sw);
  c.restore();
  c.fillStyle = 'rgba(80,84,90,.35)';
  c.beginPath();
  c.arc(500, 606, 8, 0, Math.PI * 2);
  c.fill();
}

// Fills the outline of a device with the current fillStyle (used for the 3D edge).
function fillSilhouette(c, type) {
  if (type === 'phone') {
    phoneSilhouette(c);
    c.fill();
  } else if (type === 'desktop') {
    pathRoundRect(c, 80, 0, 840, 535, [26, 26, 0, 0]);
    c.fill();
    pathRoundRect(c, 46, 535, 908, 26, [3, 3, 26, 26]);
    c.fill();
  } else monitorSilhouette(c);
}

/* ---------- Screen content ---------- */

// Height of the fixed bar band at the top of the screen (0 when the status bar is off).
function bandHeight(device) {
  if (!state.status.on || (device.type === 'phone' && device.landscape)) return 0;
  return { phone: 30, desktop: 18.7, monitor: 27.6 }[device.type];
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return .299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255);
}

function barLight(device) {
  if (!state.status.autoBg) return luminance(state.status.bg) < 140;
  return device.barLight ?? device.type !== 'phone';
}

function bandColor(device) {
  return state.status.autoBg ? (device.barColor || '#000000') : state.status.bg;
}

// The screenshot sits below the bar band, which keeps its own fixed background.
function drawScreen(c, device, x, y, w, h, dark, preview) {
  if (!device.image) return drawPlaceholder(c, x, y, w, h, dark, preview);
  const band = bandHeight(device);
  if (band > 0) {
    c.fillStyle = bandColor(device);
    c.fillRect(x, y, w, band);
  }
  drawCover(c, device.image, x, y + band, w, h - band);
}

// Screenshot size that fills the visible area exactly, as a Chrome DevTools preset.
function idealFor(device) {
  const screens = { phone: [250, 538], phoneLandscape: [538, 250], desktop: [812, 507], monitor: [952, 536] };
  const logical = { phone: [393, 3], phoneLandscape: [852, 3], desktop: [1440, 2], monitor: [1280, 2] };
  const key = device.type === 'phone' && device.landscape ? 'phoneLandscape' : device.type;
  const [sw, sh] = screens[key];
  const ratio = sw / (sh - bandHeight(device));
  const [lw, dpr] = logical[key];
  const lh = Math.round(lw / ratio);
  return { ratio, size: `${lw * dpr} × ${lh * dpr} px`, chrome: `${lw} × ${lh} · DPR ${dpr}` };
}

/* ---------- Status bar ---------- */

function drawBattery(c, x, cy, w, h, level, color) {
  c.save();
  c.globalAlpha = .5;
  c.lineWidth = 1;
  pathRoundRect(c, x + .5, cy - h / 2 + .5, w - 1, h - 1, h * .3);
  c.stroke();
  c.globalAlpha = .5;
  pathRoundRect(c, x + w + 1, cy - h * .17, 1.6, h * .34, .8);
  c.fill();
  c.restore();
  const inner = (w - 4) * Math.max(0, Math.min(100, level)) / 100;
  if (inner <= 0) return;
  c.save();
  c.fillStyle = level <= 20 ? '#ff453a' : color;
  pathRoundRect(c, x + 2, cy - h / 2 + 2, inner, h - 4, h * .2);
  c.fill();
  c.restore();
}

function drawWifi(c, cx, baseY, size) {
  c.save();
  c.lineCap = 'round';
  c.lineWidth = size * .17;
  [1, .66, .33].forEach((f) => {
    c.beginPath();
    c.arc(cx, baseY, size * f, Math.PI * 1.22, Math.PI * 1.78);
    c.stroke();
  });
  c.beginPath();
  c.arc(cx, baseY, size * .08, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawSignal(c, x, baseY, w, h) {
  const bar = w / 5.4;
  for (let i = 0; i < 4; i++) {
    const bh = h * (.35 + i * .22);
    pathRoundRect(c, x + i * bar * 1.47, baseY - bh, bar, bh, bar * .3);
    c.fill();
  }
}

function drawNotifIcon(c, kind, x, cy, s) {
  c.save();
  c.lineWidth = Math.max(1, s * .13);
  c.lineJoin = 'round';
  if (kind === 0) {
    pathRoundRect(c, x, cy - s * .45, s, s * .72, s * .22);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * .22, cy + s * .2);
    c.lineTo(x + s * .18, cy + s * .55);
    c.lineTo(x + s * .52, cy + s * .25);
    c.closePath();
    c.fill();
  }
  c.restore();
}

// Phone: iOS-style status bar around the Dynamic Island. Desktop: macOS-style menu bar.
function drawStatusBar(c, mode, device, x, y, w) {
  const s = state.status;
  if (!s.on) return;
  const light = barLight(device);
  const color = light ? '#ffffff' : '#111111';
  const [hh, mm] = s.time.split(':').map(Number);
  const minutes = String(mm || 0).padStart(2, '0');
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.textBaseline = 'middle';
  if (mode === 'phone') {
    const cy = y + 17;
    c.font = "700 13px 'DM Sans', sans-serif";
    c.textAlign = 'left';
    c.fillText(`${hh || 0}:${minutes}`, x + 22, cy + .5);
    for (let i = 0; i < Math.min(s.notifs, 1); i++) drawNotifIcon(c, 0, x + 59, cy, 9);
    let right = x + w - 17;
    drawBattery(c, right - 21, cy, 21, 10.5, s.battery, color);
    right -= 25;
    drawWifi(c, right - 7, cy + 4.5, 8.5);
    right -= 18;
    drawSignal(c, right - 12, cy + 4.5, 12, 10);
  } else {
    const u = mode === 'monitor' ? 1.15 : .78;
    const h = 24 * u;
    if (!device.image) {
      c.fillStyle = light ? 'rgba(0,0,0,.32)' : 'rgba(255,255,255,.6)';
      c.fillRect(x, y, w, h);
    }
    c.fillStyle = color;
    const cy = y + h / 2 + .5;
    c.font = `500 ${11.5 * u}px 'DM Sans', sans-serif`;
    c.textAlign = 'left';
    let left = x + 16 * u;
    ['Finder', 'File', 'Edit', 'View', 'Go', 'Window', 'Help'].forEach((item, i) => {
      c.font = `${i === 0 ? 700 : 500} ${11.5 * u}px 'DM Sans', sans-serif`;
      c.fillText(item, left, cy);
      left += c.measureText(item).width + 16 * u;
    });
    const day = new Date().toLocaleDateString('en-US', { weekday: 'short' });
    const h12 = ((hh || 0) % 12) || 12;
    const clock = `${day} ${h12}:${minutes} ${(hh || 0) >= 12 ? 'PM' : 'AM'}`;
    c.font = `500 ${11.5 * u}px 'DM Sans', sans-serif`;
    c.textAlign = 'right';
    let right = x + w - 14 * u;
    c.fillText(clock, right, cy);
    right -= c.measureText(clock).width + 14 * u;
    drawBattery(c, right - 22 * u, cy, 22 * u, 10.5 * u, s.battery, color);
    right -= 22 * u + 14 * u;
    drawWifi(c, right - 7 * u, cy + 4.5 * u, 8.5 * u);
    right -= 15 * u + 8 * u;
    for (let i = 0; i < Math.min(s.notifs, 1); i++) {
      right -= 11 * u;
      drawNotifIcon(c, 0, right, cy, 10 * u);
      right -= 7 * u;
    }
  }
  c.restore();
}

// Average color of the top edge of a screenshot, used to blend the bar band with it.
function sampleTop(image) {
  try {
    const probe = document.createElement('canvas');
    probe.width = 16;
    probe.height = 2;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    pc.drawImage(image, 0, 0, image.naturalWidth, Math.max(1, image.naturalHeight * .02), 0, 0, 16, 2);
    const { data } = pc.getImageData(0, 0, 16, 2);
    const total = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let j = 0; j < 3; j++) total[j] += data[i + j];
    const [r, g, b] = total.map((v) => Math.round(v / (data.length / 4)));
    return { barColor: `rgb(${r}, ${g}, ${b})`, barLight: .299 * r + .587 * g + .114 * b < 140 };
  } catch {
    return { barColor: null, barLight: null };
  }
}

/* ---------- Layout ---------- */

function naturalSize(device, hasBig) {
  const n = dimsOf(device);
  if (device.type !== 'phone') return n;
  const f = hasBig ? .85 : 1;
  return { w: n.w * f, h: n.h * f, f };
}

function computeLayout(width, height) {
  const hasLaptop = state.devices.some((device) => device.type !== 'phone');
  const gap = 50;
  const items = state.devices.map((device) => ({ device, ...naturalSize(device, hasLaptop) }));
  const totalW = items.reduce((sum, item) => sum + item.w, 0) + gap * (items.length - 1);
  const maxH = Math.max(...items.map((item) => item.h));
  const fit = Math.min(width * .86 / totalW, height * .72 / maxH);
  const bottom = height / 2 + (maxH * fit) / 2;
  let cursor = (width - totalW * fit) / 2;
  return items.map((item) => {
    const base = fit * (item.f || 1);
    const cx = cursor + item.w * fit / 2;
    cursor += (item.w + gap) * fit;
    const cy = bottom - item.h * fit / 2;
    const scale = base * item.device.scale / 100;
    const natural = dimsOf(item.device);
    return {
      device: item.device,
      cx: cx + item.device.x / 100 * width,
      cy: cy + item.device.y / 100 * height,
      scale,
      rotation: item.device.rotation * Math.PI / 180,
      w: natural.w,
      h: natural.h
    };
  });
}

function drawOrder() {
  return [...placements].sort((a, b) => (a.device.id === state.selectedId) - (b.device.id === state.selectedId));
}

/* ---------- Scene ---------- */

function paintBackground(c, width, height) {
  if (state.background === 'transparent') return;
  if (state.background === 'image' && state.backgroundImage) {
    drawCover(c, state.backgroundImage, 0, 0, width, height);
    return;
  }
  if (state.background === 'plain') {
    c.fillStyle = state.color;
    c.fillRect(0, 0, width, height);
    return;
  }
  const { stops } = GRADIENTS[state.gradient];
  const gradient = c.createLinearGradient(0, 0, width, height);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  c.fillStyle = gradient;
  c.fillRect(0, 0, width, height);
  const glow = c.createRadialGradient(width / 2, height * .45, 0, width / 2, height * .45, Math.max(width, height) * .6);
  glow.addColorStop(0, 'rgba(255,255,255,.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, width, height);
}

function drawScene(c, width, height, k, preview) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, width * k, height * k);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.setTransform(k, 0, 0, k, 0, 0);
  paintBackground(c, width, height);
  placements = computeLayout(width, height);
  drawOrder().forEach((p) => {
    const d = p.device;
    const yaw = d.tilt * Math.PI / 180;
    const thick = d.depth * .6;
    c.save();
    c.translate(p.cx, p.cy);
    c.rotate(p.rotation);
    // Pseudo-3D yaw: squash horizontally and skew vertically, like a card turning away.
    c.transform(Math.cos(yaw), -Math.sin(yaw) * .12, 0, 1, 0, 0);
    c.scale(p.scale, p.scale);
    if (preview && state.devices.length > 1 && d.id === state.selectedId) {
      c.save();
      c.setLineDash([10, 8]);
      c.lineWidth = 2 / p.scale;
      c.strokeStyle = 'rgba(0, 240, 200, .95)';
      c.strokeRect(-p.w / 2 - 14, -p.h / 2 - 14, p.w + 28, p.h + 28);
      c.restore();
    }
    if (d.landscape && d.type === 'phone') c.rotate(-Math.PI / 2);
    const n = NATURAL[d.type];
    c.translate(-n.w / 2, -n.h / 2);
    // shadowBlur is not affected by the transform, so convert to device pixels.
    const shadow = { blur: (46 + d.depth * .5) * p.scale * k, offset: (26 + d.depth * .4) * p.scale * k, on: true };
    if (thick > 0) {
      const steps = Math.ceil(thick / 1.5);
      c.fillStyle = EDGE[d.type];
      for (let i = steps; i >= 1; i--) {
        c.save();
        c.translate(Math.sin(yaw) * thick * i / steps, thick * .25 * i / steps);
        if (i === steps) {
          c.shadowColor = 'rgba(20, 25, 30, .4)';
          c.shadowBlur = shadow.blur;
          c.shadowOffsetY = shadow.offset;
        }
        fillSilhouette(c, d.type);
        c.restore();
      }
      shadow.on = false;
    }
    if (d.type === 'desktop') drawLaptop(c, d, shadow, preview);
    else if (d.type === 'monitor') drawMonitor(c, d, shadow, preview);
    else drawPhone(c, d, shadow, preview);
    c.restore();
  });
}

/* ---------- Preview ---------- */

function fitCanvas() {
  const { width, height } = formats[state.format];
  const full = document.fullscreenElement === canvasWrap;
  const availW = Math.max(200, canvasWrap.clientWidth - (full ? 0 : 2 * 0.05 * canvasWrap.clientWidth));
  const availH = full ? canvasWrap.clientHeight : Math.max(360, window.innerHeight - 230);
  const cssW = Math.floor(Math.min(availW, availH * width / height, full ? Infinity : 900));
  const cssH = Math.round(cssW * height / width);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const pxW = Math.round(cssW * dpr);
  // Assigning width/height clears the canvas, so only touch them when the size changes.
  const pxH = Math.round(cssH * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) { canvas.width = pxW; canvas.height = pxH; }
}

function renderPreview() {
  const { width, height } = formats[state.format];
  drawScene(ctx, width, height, canvas.width / width, true);
}

function render() {
  canvas.classList.toggle('transparent', state.background === 'transparent');
  $('#colorRow').style.opacity = state.background === 'transparent' ? '.45' : '1';
  $('#colorRow').style.pointerEvents = state.background === 'transparent' ? 'none' : 'auto';
  $('#backgroundUpload').style.display = state.background === 'image' ? 'flex' : 'none';
  fitCanvas();
  renderPreview();
  renderDeviceList();
  syncControls();
}

function redraw() {
  renderPreview();
  syncControls();
}

/* ---------- Sidebar ---------- */

function renderDeviceList() {
  const list = $('#deviceList');
  list.innerHTML = '';
  state.devices.forEach((device, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `device-card ${device.id === state.selectedId ? 'active' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'device-card-icon';
    icon.textContent = { phone: '📱', desktop: '💻', monitor: '🖥️' }[device.type];
    const copy = document.createElement('span');
    copy.className = 'device-card-copy';
    const title = document.createElement('strong');
    title.textContent = `${LABELS[device.type]} ${index + 1}`;
    const sub = document.createElement('small');
    sub.textContent = device.image ? device.fileName : 'No screenshot yet';
    copy.append(title, sub);
    card.append(icon, copy);
    card.addEventListener('click', () => selectDevice(device.id));
    if (state.devices.length > 1) {
      const remove = document.createElement('span');
      remove.className = 'remove-device';
      remove.setAttribute('role', 'button');
      remove.setAttribute('aria-label', `Remove ${title.textContent}`);
      remove.textContent = '×';
      remove.addEventListener('click', (event) => { event.stopPropagation(); removeDevice(device.id); });
      card.append(remove);
    }
    list.append(card);
  });
}

function syncControls() {
  const device = selectedDevice();
  document.querySelectorAll('.segment').forEach((item) => item.classList.toggle('active', item.dataset.device === device.type));
  const x = Math.round(device.x);
  const y = Math.round(device.y);
  $('#scaleRange').value = device.scale;
  $('#rotationRange').value = device.rotation;
  $('#positionXRange').value = x;
  $('#positionYRange').value = y;
  $('#depthRange').value = device.depth;
  $('#tiltRange').value = device.tilt;
  $('#depthValue').textContent = `${device.depth}`;
  $('#tiltValue').textContent = `${device.tilt}°`;
  $('#orientationRow').style.display = device.type === 'phone' ? 'block' : 'none';
  document.querySelectorAll('[data-orient]').forEach((item) => item.classList.toggle('active', (item.dataset.orient === 'landscape') === device.landscape));
  document.querySelectorAll('.gradient-chip').forEach((chip, i) => chip.classList.toggle('active', i === state.gradient));
  $('#gradientPresets').style.display = state.background === 'gradient' ? 'flex' : 'none';
  const st = state.status;
  $('#statusToggle').checked = st.on;
  $('#statusFields').classList.toggle('off', !st.on);
  $('#statusTime').value = st.time;
  $('#statusBgAuto').checked = st.autoBg;
  $('#statusBg').value = st.bg;
  $('#statusBg').disabled = st.autoBg;
  $('#batteryRange').value = st.battery;
  $('#notifRange').value = st.notifs;
  $('#batteryValue').textContent = `${st.battery}%`;
  $('#notifValue').textContent = st.notifs ? 'on' : 'off';
  $('#scaleValue').textContent = `${device.scale}%`;
  $('#rotationValue').textContent = `${device.rotation}°`;
  $('#positionXValue').textContent = `${x}%`;
  $('#positionYValue').textContent = `${y}%`;
  $('#fileName').textContent = device.fileName || 'PNG, JPG, WebP or GIF · max 20 MB';
  const ideal = idealFor(device);
  $('#sizeHint').innerHTML = `<strong>Ideal size for this ${LABELS[device.type].toLowerCase()}</strong><span>${ideal.size}</span><small>In Chrome DevTools (Ctrl+Shift+M, Responsive), set <b>${ideal.chrome}</b>, then ⋮ → Capture screenshot.${bandHeight(device) ? ' Capture the page only: the status bar gets its own background above it.' : ''} Other sizes are centered and cropped.</small>`;
  const off = device.image && Math.abs(device.image.naturalWidth / device.image.naturalHeight / ideal.ratio - 1) > .03;
  $('#sizeHint').classList.toggle('warn', Boolean(off));
  $('#imageDimensions').textContent = device.image ? `${device.image.naturalWidth} × ${device.image.naturalHeight} px${off ? ' · will be cropped' : ' · perfect fit'}` : '';
  $('#previewSize').textContent = `${state.devices.length} device${state.devices.length === 1 ? '' : 's'} · ${formats[state.format].label}`;
}

function selectDevice(id) {
  state.selectedId = id;
  renderDeviceList();
  syncControls();
  renderPreview();
}

function removeDevice(id) {
  state.devices = state.devices.filter((device) => device.id !== id);
  if (state.selectedId === id) state.selectedId = state.devices[0].id;
  render();
}

function addDevice(type) {
  const device = newDevice(state.nextId++, type);
  state.devices.push(device);
  state.selectedId = device.id;
  render();
  showToast(`${LABELS[type]} beamed in. Feed it a screenshot!`);
}

async function loadFile(file, device = selectedDevice()) {
  if (!file || !file.type.startsWith('image/')) return showToast('Please choose a PNG, JPG, WebP or GIF image.');
  if (file.size > MAX_FILE_SIZE) return showToast('That image is larger than 20 MB.');
  try {
    device.image = await loadImage(file);
    Object.assign(device, sampleTop(device.image));
  } catch {
    return showToast('That image could not be read.');
  }
  device.fileName = file.name;
  state.selectedId = device.id;
  render();
  showToast('Pixels received. Looking sharp!');
}

fileInput.addEventListener('change', (event) => { loadFile(event.target.files[0]); event.target.value = ''; });
['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
$('#addPhoneButton').addEventListener('click', () => addDevice('phone'));
$('#addDesktopButton').addEventListener('click', () => addDevice('desktop'));
$('#statusToggle').addEventListener('change', (event) => { state.status.on = event.target.checked; redraw(); });
$('#statusBgAuto').addEventListener('change', (event) => { state.status.autoBg = event.target.checked; redraw(); });
$('#statusBg').addEventListener('input', (event) => { state.status.bg = event.target.value; redraw(); });
$('#statusTime').addEventListener('input', (event) => { if (event.target.value) { state.status.time = event.target.value; redraw(); } });
$('#batteryRange').addEventListener('input', (event) => { state.status.battery = Number(event.target.value); redraw(); });
$('#notifRange').addEventListener('input', (event) => { state.status.notifs = Number(event.target.value); redraw(); });
$('#addMonitorButton').addEventListener('click', () => addDevice('monitor'));
document.querySelectorAll('[data-orient]').forEach((button) => button.addEventListener('click', () => {
  selectedDevice().landscape = button.dataset.orient === 'landscape';
  redraw();
}));
GRADIENTS.forEach((g, i) => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'gradient-chip';
  chip.title = g.name;
  chip.style.background = `linear-gradient(135deg, ${g.stops.join(', ')})`;
  chip.addEventListener('click', () => { state.gradient = i; redraw(); });
  $('#gradientPresets').append(chip);
});
$('#surpriseButton').addEventListener('click', () => {
  state.background = 'gradient';
  state.gradient = Math.floor(Math.random() * GRADIENTS.length);
  document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'gradient'));
  state.devices.forEach((device) => {
    device.rotation = Math.round(Math.random() * 16 - 8);
    device.tilt = Math.round(Math.random() * 50 - 25);
    device.depth = Math.round(20 + Math.random() * 40);
  });
  render();
  showToast(['Boom! Fresh vibes.', 'Gravity is optional.', 'Chaos, but make it pretty.', 'Plot twist!'][Math.floor(Math.random() * 4)]);
});

document.querySelectorAll('.segment').forEach((button) => button.addEventListener('click', () => {
  selectedDevice().type = button.dataset.device;
  render();
}));
document.querySelectorAll('.background-option').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.background-option').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  state.background = button.dataset.background;
  render();
}));
$('#backgroundColor').addEventListener('input', (event) => {
  state.color = event.target.value;
  $('#colorValue').textContent = state.color.toUpperCase();
  if (state.background === 'gradient' || state.background === 'transparent') {
    state.background = 'plain';
    document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'plain'));
    render();
  } else redraw();
});
backgroundInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !file.type.startsWith('image/')) return showToast('Please choose a PNG, JPG or WebP background image.');
  if (file.size > MAX_FILE_SIZE) return showToast('That background image is larger than 20 MB.');
  try {
    state.backgroundImage = await loadImage(file);
  } catch {
    return showToast('That image could not be read.');
  }
  $('#backgroundFileName').textContent = file.name;
  state.background = 'image';
  document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'image'));
  render();
  showToast('Personal background added.');
});

[['#depthRange', 'depth'], ['#tiltRange', 'tilt'], ['#scaleRange', 'scale'], ['#rotationRange', 'rotation'], ['#positionXRange', 'x'], ['#positionYRange', 'y']].forEach(([selector, key]) => {
  $(selector).addEventListener('input', (event) => { selectedDevice()[key] = Number(event.target.value); redraw(); });
});
document.querySelectorAll('.format-option').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.format-option').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  state.format = button.dataset.format;
  render();
}));

$('#resetButton').addEventListener('click', () => {
  Object.assign(state, {
    background: 'gradient', gradient: 0, color: DEFAULT_COLOR, format: 'portrait', backgroundImage: null,
    selectedId: 1, nextId: 2, status: defaultStatus(), devices: [newDevice(1, 'phone')]
  });
  $('#backgroundFileName').textContent = 'No image selected';
  $('#backgroundColor').value = DEFAULT_COLOR;
  $('#colorValue').textContent = DEFAULT_COLOR.toUpperCase();
  document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'gradient'));
  document.querySelectorAll('.format-option').forEach((item) => item.classList.toggle('active', item.dataset.format === 'portrait'));
  render();
  showToast('Back to a clean slate.');
});

$('#fullscreenButton').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (canvasWrap.requestFullscreen) canvasWrap.requestFullscreen();
});
document.addEventListener('fullscreenchange', () => { fitCanvas(); renderPreview(); });
new ResizeObserver(() => {
  if (document.fullscreenElement) return;
  fitCanvas();
  renderPreview();
}).observe(canvasWrap);
window.addEventListener('resize', () => { fitCanvas(); renderPreview(); });

/* ---------- Direct manipulation: drag devices on the preview ---------- */

function pointerToFormat(event) {
  const rect = canvas.getBoundingClientRect();
  const { width, height } = formats[state.format];
  return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height, rect };
}

function hitTest(point) {
  const order = drawOrder();
  for (let i = order.length - 1; i >= 0; i--) {
    const p = order[i];
    const dx = point.x - p.cx;
    const dy = point.y - p.cy;
    const cos = Math.cos(-p.rotation);
    const sin = Math.sin(-p.rotation);
    const squash = Math.max(.3, Math.cos(p.device.tilt * Math.PI / 180));
    const lx = (dx * cos - dy * sin) / p.scale / squash;
    const ly = (dx * sin + dy * cos) / p.scale;
    if (Math.abs(lx) <= p.w / 2 && Math.abs(ly) <= p.h / 2) return p.device;
  }
  return null;
}

let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  const hit = hitTest(pointerToFormat(event));
  if (!hit) return;
  canvas.setPointerCapture(event.pointerId);
  if (hit.id !== state.selectedId) selectDevice(hit.id);
  drag = { device: hit, startX: event.clientX, startY: event.clientY, x: hit.x, y: hit.y };
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) {
    canvas.style.cursor = hitTest(pointerToFormat(event)) ? 'grab' : '';
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const clamp = (value) => Math.max(-60, Math.min(60, value));
  drag.device.x = clamp(drag.x + (event.clientX - drag.startX) / rect.width * 100);
  drag.device.y = clamp(drag.y + (event.clientY - drag.startY) / rect.height * 100);
  redraw();
});
['pointerup', 'pointercancel'].forEach((name) => canvas.addEventListener(name, () => { drag = null; canvas.style.cursor = ''; }));

canvas.addEventListener('dragover', (event) => event.preventDefault());
canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  const target = hitTest(pointerToFormat(event)) || selectedDevice();
  loadFile(event.dataTransfer.files[0], target);
});

/* ---------- Export ---------- */

async function exportPng() {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const { width, height } = formats[state.format];
  const out = document.createElement('canvas');
  out.width = width * EXPORT_SCALE;
  out.height = height * EXPORT_SCALE;
  const saved = placements;
  drawScene(out.getContext('2d'), width, height, EXPORT_SCALE, false);
  placements = saved;
  out.toBlob((blob) => {
    if (!blob) return showToast('Export failed. Try a smaller format.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `mockuplab-${state.format}-${out.width}x${out.height}.png`;
    link.href = url;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Launched! ${out.width} × ${out.height} px.`);
  }, 'image/png');
}
$('#downloadButton').addEventListener('click', exportPng);

render();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderPreview);
