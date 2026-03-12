/**
 * Raster Painter — main application.
 * Wires engine, slicer, preview, and export together.
 */

import { createRasterEngine } from './engine.js';
import * as slicer from './slicer.js';

// --- State ---
let engine = null;
let running = false;
let animFrameId = null;
let currentSlices = null;

// --- DOM ---
const $ = (id) => document.getElementById(id);

const colsInput = $('cols');
const rowsInput = $('rows');
const cellSizeInput = $('cellSize');
const btnInit = $('btnInit');
const gridInfo = $('gridInfo');

const windDirInput = $('windDir');
const noiseInput = $('noise');
const turbInput = $('turb');
const strengthInput = $('strength');
const transferInput = $('transfer');
const smoothInput = $('smooth');
const windDirVal = $('windDirVal');
const noiseVal = $('noiseVal');
const turbVal = $('turbVal');
const strengthVal = $('strengthVal');
const transferVal = $('transferVal');
const smoothVal = $('smoothVal');

const btnRun = $('btnRun');
const btnStep = $('btnStep');
const btnStepN = $('btnStepN');
const stepNInput = $('stepN');
const simInfo = $('simInfo');

const blurInput = $('blur');
const blurVal = $('blurVal');
const btnBlur = $('btnBlur');

const numSlicesInput = $('numSlices');
const sliceInfo = $('sliceInfo');
const sliceSuggestions = $('sliceSuggestions');
const btnSlice = $('btnSlice');

const dotSizeInput = $('dotSize');
const btnExportFull = $('btnExportFull');
const btnExportSlices = $('btnExportSlices');

const previewCanvas = $('preview');
const previewCtx = previewCanvas.getContext('2d');
const sliceContainer = $('sliceContainer');

// --- Preview rendering ---
let imageData = null;
let imageBuffer = null;

function renderPreview() {
  if (!engine) return;

  const cols = engine.getCols();
  const rows = engine.getRows();
  const pixels = engine.getPixels();

  if (previewCanvas.width !== cols || previewCanvas.height !== rows) {
    previewCanvas.width = cols;
    previewCanvas.height = rows;
    imageData = previewCtx.createImageData(cols, rows);
    imageBuffer = new Uint32Array(imageData.data.buffer);
  }

  for (let i = 0; i < pixels.length; i++) {
    const h = Math.max(0, Math.min(1, pixels[i]));
    const g = Math.round(h * 255);
    // ABGR (little-endian)
    imageBuffer[i] = (255 << 24) | (g << 16) | (g << 8) | g;
  }

  previewCtx.putImageData(imageData, 0, 0);
}

// --- Simulation loop ---

function tick() {
  if (!running || !engine) return;
  engine.step();
  renderPreview();
  updateSimInfo();
  animFrameId = requestAnimationFrame(tick);
}

function startSim() {
  if (!engine) return;
  running = true;
  btnRun.textContent = 'Pause';
  tick();
}

function pauseSim() {
  running = false;
  btnRun.textContent = 'Run';
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

// --- Info displays ---

function updateGridInfo() {
  if (!engine) {
    gridInfo.textContent = '';
    return;
  }
  const c = engine.getCols();
  const r = engine.getRows();
  gridInfo.textContent = `${c} \u00d7 ${r} = ${(c * r).toLocaleString()} dots`;
}

function updateSimInfo() {
  if (!engine) {
    simInfo.textContent = '';
    return;
  }
  simInfo.textContent = `Step: ${engine.getStepCount()}`;
}

function updateSliceValidation() {
  const cols = parseInt(colsInput.value, 10) || 0;
  const rows = parseInt(rowsInput.value, 10) || 0;
  const n = parseInt(numSlicesInput.value, 10) || 0;

  if (n < 1 || cols < 1) {
    sliceInfo.textContent = '';
    sliceInfo.className = 'info';
    sliceSuggestions.textContent = '';
    return;
  }

  const result = slicer.validate(cols, n);

  if (result.valid) {
    sliceInfo.textContent = `${n} slices \u2192 ${result.sliceDots} \u00d7 ${rows} dots each`;
    sliceInfo.className = 'info valid';
    sliceSuggestions.textContent = '';
  } else {
    sliceInfo.textContent = `Uneven: ${cols} / ${n} = ${(cols / n).toFixed(1)} (remainder ${result.remainder})`;
    sliceInfo.className = 'info invalid';

    const divs = slicer.getDivisors(cols).filter((d) => d > 1 && d <= cols / 2);
    const suggestions = divs.length > 20 ? divs.slice(0, 20) : divs;
    sliceSuggestions.textContent = `Valid: ${suggestions.join(', ')}${divs.length > 20 ? '...' : ''}`;
  }
}

// --- Slider wiring ---

function wireSlider(input, display, setter, format) {
  const fmt = format || ((v) => v);
  function update() {
    const v = parseFloat(input.value);
    display.textContent = fmt(v);
    if (engine) setter(v);
  }
  input.addEventListener('input', update);
  update();
}

// --- Export ---

function renderToExportCanvas(pixels, cols, rows) {
  const dotSize = parseInt(dotSizeInput.value, 10) || 4;
  const radius = dotSize * 0.35;
  const w = cols * dotSize;
  const h = rows * dotSize;

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const brightness = Math.max(0, Math.min(1, pixels[y * cols + x]));
      const g = Math.round(brightness * 255);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      ctx.arc(x * dotSize + dotSize * 0.5, y * dotSize + dotSize * 0.5, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return c;
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportFull() {
  if (!engine) return;
  const c = renderToExportCanvas(engine.getPixels(), engine.getCols(), engine.getRows());
  downloadCanvas(c, 'raster-full.png');
}

function exportSlices() {
  if (!currentSlices || currentSlices.length === 0) {
    alert('Slice first.');
    return;
  }

  currentSlices.forEach((s) => {
    const c = renderToExportCanvas(s.pixels, s.cols, s.rows);
    const padded = String(s.index).padStart(3, '0');
    downloadCanvas(c, `raster-slice-${padded}.png`);
  });
}

// --- Slicing ---

function doSlice() {
  if (!engine) return;
  const n = parseInt(numSlicesInput.value, 10) || 1;
  const cols = engine.getCols();
  const rows = engine.getRows();
  const result = slicer.validate(cols, n);

  if (!result.valid) {
    alert(`Cannot slice cleanly: ${cols} / ${n} has remainder ${result.remainder}.\nPick a divisor of ${cols}.`);
    return;
  }

  currentSlices = slicer.slice(engine.getPixels(), cols, rows, n);

  // Render slice previews
  sliceContainer.innerHTML = '';
  currentSlices.forEach((s) => {
    const c = document.createElement('canvas');
    c.width = s.cols;
    c.height = s.rows;
    c.title = `Slice ${s.index}: ${s.cols} \u00d7 ${s.rows}`;
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(s.cols, s.rows);
    const buf = new Uint32Array(id.data.buffer);

    for (let i = 0; i < s.pixels.length; i++) {
      const h = Math.max(0, Math.min(1, s.pixels[i]));
      const g = Math.round(h * 255);
      buf[i] = (255 << 24) | (g << 16) | (g << 8) | g;
    }

    ctx.putImageData(id, 0, 0);
    sliceContainer.appendChild(c);
  });
}

// --- Init ---

function initEngine() {
  pauseSim();

  const cols = parseInt(colsInput.value, 10) || 500;
  const rows = parseInt(rowsInput.value, 10) || 250;
  const cellSize = parseInt(cellSizeInput.value, 10) || 6;

  engine = createRasterEngine({ cols, rows, cellSize });
  currentSlices = null;
  sliceContainer.innerHTML = '';

  renderPreview();
  updateGridInfo();
  updateSimInfo();
  updateSliceValidation();

  // Apply current slider values
  engine.setWindDirection(parseFloat(windDirInput.value));
  engine.setNoiseInfluence(parseFloat(noiseInput.value));
  engine.setTurbulence(parseFloat(turbInput.value));
  engine.setWindStrength(parseFloat(strengthInput.value));
  engine.setTransferRate(parseFloat(transferInput.value));
  engine.setPixelSmooth(parseFloat(smoothInput.value));
}

// --- Event wiring ---

btnInit.addEventListener('click', initEngine);

btnRun.addEventListener('click', () => {
  if (running) {
    pauseSim();
  } else {
    startSim();
  }
});

btnStep.addEventListener('click', () => {
  if (!engine) return;
  pauseSim();
  engine.step();
  renderPreview();
  updateSimInfo();
});

btnStepN.addEventListener('click', () => {
  if (!engine) return;
  pauseSim();
  const n = parseInt(stepNInput.value, 10) || 100;
  engine.stepN(n);
  renderPreview();
  updateSimInfo();
});

btnBlur.addEventListener('click', () => {
  if (!engine) return;
  const r = parseInt(blurInput.value, 10) || 0;
  if (r > 0) {
    engine.blur(r);
    renderPreview();
  }
});

btnSlice.addEventListener('click', doSlice);
btnExportFull.addEventListener('click', exportFull);
btnExportSlices.addEventListener('click', exportSlices);

wireSlider(windDirInput, windDirVal, (v) => engine?.setWindDirection(v), (v) => String(Math.round(v)));
wireSlider(noiseInput, noiseVal, (v) => engine?.setNoiseInfluence(v), (v) => v.toFixed(2));
wireSlider(turbInput, turbVal, (v) => engine?.setTurbulence(v), (v) => v.toFixed(3));
wireSlider(strengthInput, strengthVal, (v) => engine?.setWindStrength(v), (v) => String(Math.round(v)));
wireSlider(transferInput, transferVal, (v) => engine?.setTransferRate(v), (v) => v.toFixed(3));
wireSlider(smoothInput, smoothVal, (v) => engine?.setPixelSmooth(v), (v) => v.toFixed(2));
wireSlider(blurInput, blurVal, () => {}, (v) => String(Math.round(v)));

colsInput.addEventListener('input', updateSliceValidation);
numSlicesInput.addEventListener('input', updateSliceValidation);

// Auto-init on load
initEngine();
