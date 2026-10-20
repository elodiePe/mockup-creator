const state = {
  background: 'gradient',
  color: '#f2a187',
  format: 'portrait',
  backgroundImage: null,
  backgroundImageUrl: null,
  selectedId: 1,
  nextId: 2,
  devices: [{ id: 1, type: 'phone', scale: 100, rotation: -4, x: 0, y: 0, image: null, imageUrl: null, fileName: '' }]
};

const $ = (selector) => document.querySelector(selector);
const previewCanvas = $('#previewCanvas');
const deviceStage = $('#deviceStage');
const fileInput = $('#fileInput');
const backgroundInput = $('#backgroundInput');
const dropzone = $('#dropzone');
const toast = $('#toast');
const macbookFrame = new Image();
macbookFrame.src = 'macbook-frame.svg';
const formats = {
  square: { width: 1200, height: 1200, label: '1200 × 1200 px' },
  portrait: { width: 1200, height: 1500, label: '1200 × 1500 px' },
  story: { width: 1080, height: 1920, label: '1080 × 1920 px' },
  landscape: { width: 1600, height: 900, label: '1600 × 900 px' }
};

function selectedDevice() {
  return state.devices.find((device) => device.id === state.selectedId) || state.devices[0];
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderDeviceList() {
  $('#deviceList').innerHTML = state.devices.map((device, index) => `
    <button class="device-card ${device.id === state.selectedId ? 'active' : ''}" data-select-device="${device.id}">
      <span class="device-card-icon">${device.type === 'phone' ? '▯' : '▱'}</span>
      <span class="device-card-copy"><strong>${device.type === 'phone' ? 'Phone' : 'Desktop'} ${index + 1}</strong><small>${device.image ? device.fileName : 'No screenshot yet'}</small></span>
      ${state.devices.length > 1 ? `<span class="remove-device" data-remove-device="${device.id}" aria-label="Remove device">×</span>` : ''}
    </button>
  `).join('');
  $('#deviceList').querySelectorAll('[data-select-device]').forEach((button) => button.addEventListener('click', () => {
    state.selectedId = Number(button.dataset.selectDevice);
    syncControls();
    render();
  }));
  $('#deviceList').querySelectorAll('[data-remove-device]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const removed = state.devices.find((device) => device.id === Number(button.dataset.removeDevice));
    if (removed.imageUrl) URL.revokeObjectURL(removed.imageUrl);
    state.devices = state.devices.filter((device) => device.id !== removed.id);
    if (state.selectedId === removed.id) state.selectedId = state.devices[0].id;
    syncControls();
    render();
  }));
}

function syncControls() {
  const device = selectedDevice();
  document.querySelectorAll('.segment').forEach((item) => item.classList.toggle('active', item.dataset.device === device.type));
  $('#scaleRange').value = device.scale;
  $('#rotationRange').value = device.rotation;
  $('#positionXRange').value = device.x;
  $('#positionYRange').value = device.y;
  $('#scaleValue').textContent = `${device.scale}%`;
  $('#rotationValue').textContent = `${device.rotation}°`;
  $('#positionXValue').textContent = `${device.x}%`;
  $('#positionYValue').textContent = `${device.y}%`;
  $('#fileName').textContent = device.fileName || 'PNG, JPG or WebP · max 20 MB';
  $('#previewSize').textContent = `${state.devices.length} device${state.devices.length === 1 ? '' : 's'} · ${formats[state.format].label}`;
}

function makeDeviceElement(device) {
  const wrapper = document.createElement('div');
  wrapper.className = `device ${device.type}`;
  wrapper.dataset.deviceId = device.id;
  wrapper.style.transform = `scale(${device.scale / 100}) rotate(${device.rotation}deg)`;
  wrapper.style.left = `${device.x}%`;
  wrapper.style.top = `${device.y}%`;
  wrapper.innerHTML = device.type === 'desktop' ? `<div class="desktop-art">
    <img class="desktop-screen-image" alt="Screenshot for desktop" />
    <img class="desktop-frame-svg" src="macbook-frame.svg" alt="" />
  </div>` : `<div class="device-shell">
    <div class="speaker"></div><div class="camera"></div>
    <img class="screen-image" alt="Screenshot for ${device.type}" />
    <div class="screen-placeholder"><span class="placeholder-icon">＋</span><span>Upload a screenshot<br>to see it here</span></div>
    <div class="keyboard-deck"><span class="keyboard-row"></span><span class="keyboard-row"></span><span class="trackpad"></span></div>
    <div class="home-indicator"></div>
  </div>
  <div class="desktop-stand"><div class="stand-neck"></div><div class="stand-base"></div></div>`;
  if (device.type === 'desktop') {
    const desktopImage = wrapper.querySelector('.desktop-screen-image');
    if (device.imageUrl) desktopImage.src = device.imageUrl;
    return wrapper;
  }
  const image = wrapper.querySelector('.screen-image');
  const placeholder = wrapper.querySelector('.screen-placeholder');
  if (device.imageUrl) {
    image.src = device.imageUrl;
    placeholder.style.display = 'none';
  } else {
    image.style.display = 'none';
  }
  return wrapper;
}

function render() {
  previewCanvas.classList.remove('gradient', 'plain', 'transparent');
  previewCanvas.classList.add(state.background);
  previewCanvas.style.setProperty('--selected-color', state.color);
  previewCanvas.style.aspectRatio = `${formats[state.format].width} / ${formats[state.format].height}`;
  previewCanvas.style.backgroundImage = state.background === 'image' && state.backgroundImageUrl
    ? `url("${state.backgroundImageUrl}")`
    : '';
  previewCanvas.style.backgroundSize = state.background === 'image' ? 'cover' : '';
  previewCanvas.style.backgroundPosition = state.background === 'image' ? 'center' : '';
  $('#colorRow').style.opacity = state.background === 'transparent' ? '.45' : '1';
  $('#colorRow').style.pointerEvents = state.background === 'transparent' ? 'none' : 'auto';
  $('#backgroundUpload').style.display = state.background === 'image' ? 'flex' : 'none';
  deviceStage.replaceChildren(...state.devices.map(makeDeviceElement));
  renderDeviceList();
  syncControls();
}

function addDevice(type) {
  const device = { id: state.nextId++, type, scale: type === 'phone' ? 84 : 80, rotation: 0, x: 0, y: 0, image: null, imageUrl: null, fileName: '' };
  state.devices.push(device);
  state.selectedId = device.id;
  render();
  showToast(`${type === 'phone' ? 'Phone' : 'Desktop'} added. Upload its screenshot.`);
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return showToast('Please choose a PNG, JPG, WebP or GIF image.');
  if (file.size > 20 * 1024 * 1024) return showToast('That image is larger than 20 MB.');
  const device = selectedDevice();
  if (device.imageUrl) URL.revokeObjectURL(device.imageUrl);
  device.imageUrl = URL.createObjectURL(file);
  device.fileName = file.name;
  device.image = new Image();
  device.image.onload = () => {
    render();
    $('#imageDimensions').textContent = `${device.image.naturalWidth} × ${device.image.naturalHeight} px`;
    showToast('Screenshot added to the selected device.');
  };
  device.image.src = device.imageUrl;
}

fileInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
$('#addPhoneButton').addEventListener('click', () => addDevice('phone'));
$('#addDesktopButton').addEventListener('click', () => addDevice('desktop'));

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
$('#backgroundColor').addEventListener('input', (event) => { state.color = event.target.value; $('#colorValue').textContent = state.color.toUpperCase(); render(); });
backgroundInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith('image/')) return showToast('Please choose a PNG, JPG or WebP background image.');
  if (file.size > 20 * 1024 * 1024) return showToast('That background image is larger than 20 MB.');
  if (state.backgroundImageUrl) URL.revokeObjectURL(state.backgroundImageUrl);
  state.backgroundImageUrl = URL.createObjectURL(file);
  state.backgroundImage = new Image();
  state.backgroundImage.onload = () => {
    $('#backgroundFileName').textContent = file.name;
    state.background = 'image';
    document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'image'));
    render();
    showToast('Personal background added.');
  };
  state.backgroundImage.src = state.backgroundImageUrl;
});
$('#scaleRange').addEventListener('input', (event) => { selectedDevice().scale = Number(event.target.value); render(); });
$('#rotationRange').addEventListener('input', (event) => { selectedDevice().rotation = Number(event.target.value); render(); });
$('#positionXRange').addEventListener('input', (event) => { selectedDevice().x = Number(event.target.value); render(); });
$('#positionYRange').addEventListener('input', (event) => { selectedDevice().y = Number(event.target.value); render(); });
document.querySelectorAll('.format-option').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.format-option').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  state.format = button.dataset.format;
  render();
}));

$('#resetButton').addEventListener('click', () => {
  state.devices.slice(1).forEach((device) => { if (device.imageUrl) URL.revokeObjectURL(device.imageUrl); });
  state.devices = [{ id: 1, type: 'phone', scale: 100, rotation: -4, x: 0, y: 0, image: null, imageUrl: null, fileName: '' }];
  state.selectedId = 1; state.background = 'gradient'; state.color = '#f2a187'; state.format = 'portrait';
  if (state.backgroundImageUrl) URL.revokeObjectURL(state.backgroundImageUrl);
  state.backgroundImage = null; state.backgroundImageUrl = null;
  $('#backgroundInput').value = ''; $('#backgroundFileName').textContent = 'No image selected';
  document.querySelectorAll('.background-option').forEach((item) => item.classList.toggle('active', item.dataset.background === 'gradient'));
  document.querySelectorAll('.format-option').forEach((item) => item.classList.toggle('active', item.dataset.format === 'portrait'));
  $('#backgroundColor').value = state.color; $('#colorValue').textContent = '#F2A187'; $('#imageDimensions').textContent = '';
  render(); showToast('Mockup reset.');
});
$('#fullscreenButton').addEventListener('click', () => { if (previewCanvas.requestFullscreen) previewCanvas.requestFullscreen(); });

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}
function drawMockup(context, device, x, y, frameWidth, frameHeight) {
  const isPhone = device.type === 'phone';
  context.save();
  context.translate(x + frameWidth / 2, y + frameHeight / 2);
  context.rotate(device.rotation * Math.PI / 180);
  context.scale(device.scale / 100, device.scale / 100);
  context.translate(-frameWidth / 2, -frameHeight / 2);
  context.shadowColor = 'rgba(20, 25, 30, .28)'; context.shadowBlur = 36; context.shadowOffsetY = 20;
  const shellHeight = isPhone ? frameHeight : frameHeight * (538 / 650);
  context.fillStyle = isPhone ? '#17191c' : '#050607';
  roundedRect(context, 0, 0, frameWidth, shellHeight, isPhone ? frameWidth * .13 : 16);
  context.shadowColor = 'transparent';
  const inset = isPhone ? 8 : 13;
  const bottomInset = isPhone ? 8 : 8;
  if (device.image) context.drawImage(device.image, inset, inset, frameWidth - inset * 2, shellHeight - inset - bottomInset);
  else { context.fillStyle = '#f3f4f2'; context.fillRect(inset, inset, frameWidth - inset * 2, shellHeight - inset - bottomInset); }
  if (isPhone) {
    context.fillStyle = '#050607';
    roundedRect(context, frameWidth / 2 - frameWidth * .17, 10, frameWidth * .34, 24, 13);
  } else {
    context.fillStyle = '#f3f4f2';
    context.fillRect(frameWidth * .155, frameHeight * .146, frameWidth * .69, frameHeight * .692);
    if (device.image) context.drawImage(device.image, frameWidth * .155, frameHeight * .146, frameWidth * .69, frameHeight * .692);
    if (macbookFrame.complete) context.drawImage(macbookFrame, 0, 0, frameWidth, frameHeight);
  }
  context.restore();
}
async function exportPng() {
  if (!macbookFrame.complete) await new Promise((resolve) => { macbookFrame.onload = resolve; });
  const { width, height } = formats[state.format]; const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (state.background !== 'transparent') {
    if (state.background === 'image' && state.backgroundImage) {
      const imageRatio = state.backgroundImage.naturalWidth / state.backgroundImage.naturalHeight;
      const canvasRatio = width / height;
      let sourceWidth = state.backgroundImage.naturalWidth;
      let sourceHeight = state.backgroundImage.naturalHeight;
      let sourceX = 0;
      let sourceY = 0;
      if (imageRatio > canvasRatio) {
        sourceWidth = state.backgroundImage.naturalHeight * canvasRatio;
        sourceX = (state.backgroundImage.naturalWidth - sourceWidth) / 2;
      } else {
        sourceHeight = state.backgroundImage.naturalWidth / canvasRatio;
        sourceY = (state.backgroundImage.naturalHeight - sourceHeight) / 2;
      }
      context.drawImage(state.backgroundImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    } else if (state.background === 'plain') context.fillStyle = state.color;
    else { const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, '#ffe8dc'); gradient.addColorStop(1, '#f49a7b'); context.fillStyle = gradient; }
    if (state.background !== 'image') context.fillRect(0, 0, width, height);
  }
  const phones = state.devices.filter((device) => device.type === 'phone');
  const desktops = state.devices.filter((device) => device.type === 'desktop');
  const gap = 35;
  state.devices.forEach((device, index) => {
    const isPhone = device.type === 'phone';
    const frameWidth = isPhone ? Math.min(280, 850 / Math.max(phones.length, 1)) : Math.min(980, width * .62);
    const frameHeight = isPhone ? frameWidth * 2 : frameWidth / 1.42;
    const sameTypeIndex = state.devices.slice(0, index).filter((item) => item.type === device.type).length;
    const total = isPhone ? phones.length : desktops.length;
    const rowWidth = total * frameWidth + (total - 1) * gap;
    const baseX = isPhone ? (width - rowWidth) / 2 + sameTypeIndex * (frameWidth + gap) : (width - frameWidth) / 2;
    const baseY = isPhone
      ? Math.max(40, height - frameHeight - (state.format === 'story' ? 80 : 120))
      : Math.max(40, (height - frameHeight) / 2 - (state.format === 'portrait' ? 80 : 0) + sameTypeIndex * 30);
    drawMockup(context, device, baseX + (device.x / 100) * width, baseY + (device.y / 100) * height, frameWidth, frameHeight);
  });
  const link = document.createElement('a'); link.download = 'framecraft-multi-device-mockup.png'; link.href = canvas.toDataURL('image/png'); link.click();
  showToast('Your multi-device mockup is ready to download.');
}
$('#downloadButton').addEventListener('click', exportPng);
render();
