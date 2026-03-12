/**
 * Raster simulation engine.
 * Ported from LandingPage controller.js — decoupled from DOM/canvas.
 * All state lives in typed arrays. No allocations during simulation.
 */

const TWO_PI = Math.PI * 2;

function fade(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash3(ix, iy, iz) {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);

  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x0 + 1, y0, z0);
  const n010 = hash3(x0, y0 + 1, z0);
  const n110 = hash3(x0 + 1, y0 + 1, z0);
  const n001 = hash3(x0, y0, z0 + 1);
  const n101 = hash3(x0 + 1, y0, z0 + 1);
  const n011 = hash3(x0, y0 + 1, z0 + 1);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1);

  const nx00 = lerp(n000, n100, tx);
  const nx10 = lerp(n010, n110, tx);
  const nx01 = lerp(n001, n101, tx);
  const nx11 = lerp(n011, n111, tx);
  const nxy0 = lerp(nx00, nx10, ty);
  const nxy1 = lerp(nx01, nx11, ty);
  return lerp(nxy0, nxy1, tz);
}

function wrapI(i, n) {
  return ((i % n) + n) % n;
}

export function createRasterEngine({ cols, rows, cellSize = 6 }) {
  const cell = cellSize;

  // --- Simulation parameters ---
  let dir = { x: 1, y: 0.5 };
  let noiseInf = 0.2;
  let turb = 0.01;
  const smooth = 1.0;
  let windStrength = 600;
  const coherenceFactor = 0.5;
  const noiseScale = 0.05;
  let transferRate = 0.003;
  let pixelSmoothVal = 0.1;

  // Vector grid spacing
  const vecOff = 0.5 * cell;
  const vecStep = 14 * cell;

  let simTime = 0;
  let stepCount = 0;

  // --- Pixel brightness ---
  const totalPixels = cols * rows;
  let pixels = new Float32Array(totalPixels);

  // Pre-allocated pixel simulation buffers
  const vxBuf = new Float32Array(totalPixels);
  const vyBuf = new Float32Array(totalPixels);
  const qBuf = new Float32Array(totalPixels);
  const tBuf = new Uint32Array(totalPixels);
  const sBuf = new Float32Array(totalPixels);
  const nextH = new Float32Array(totalPixels);

  // --- Vector field ---
  let vecDirX = null;
  let vecDirY = null;
  let vecPosX = null;
  let vecPosY = null;
  let tempVecX = null;
  let tempVecY = null;
  let vecColCount = 0;
  let vecRowCount = 0;
  let vecGridW = 0;
  let vecGridH = 0;

  function initPixels() {
    for (let i = 0; i < totalPixels; i++) {
      pixels[i] = 0.1 + Math.random() * 0.8;
    }
  }

  function initVecGrid() {
    const ledMaxX = cols * cell;
    const ledMaxY = rows * cell;
    const maxNeedX = ledMaxX + vecOff;
    const maxNeedY = ledMaxY + vecOff;

    const xs = [];
    let vx = -vecOff;
    while (vx < maxNeedX) {
      xs.push(vx);
      vx += vecStep;
    }
    xs.push(maxNeedX);

    const ys = [];
    let vy = -vecOff;
    while (vy < maxNeedY) {
      ys.push(vy);
      vy += vecStep;
    }
    ys.push(maxNeedY);

    vecColCount = xs.length;
    vecRowCount = ys.length;
    vecGridW = Math.max(1, vecColCount - 1);
    vecGridH = Math.max(1, vecRowCount - 1);

    const totalVec = vecColCount * vecRowCount;
    vecDirX = new Float32Array(totalVec);
    vecDirY = new Float32Array(totalVec);
    vecPosX = new Float32Array(totalVec);
    vecPosY = new Float32Array(totalVec);
    tempVecX = new Float32Array(totalVec);
    tempVecY = new Float32Array(totalVec);

    for (let yi = 0; yi < vecRowCount; yi++) {
      for (let xi = 0; xi < vecColCount; xi++) {
        const idx = yi * vecColCount + xi;
        vecPosX[idx] = xs[xi];
        vecPosY[idx] = ys[yi];
        vecDirX[idx] = dir.x * windStrength;
        vecDirY[idx] = dir.y * windStrength;
      }
    }
  }

  function stepLed() {
    // Phase 1: interpolate vector at each pixel
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const px = x * cell;
        const py = y * cell;

        const fx = (px + vecOff) / vecStep;
        const fy = (py + vecOff) / vecStep;
        const ix0f = Math.floor(fx);
        const iy0f = Math.floor(fy);
        const tx = fx - ix0f;
        const ty = fy - iy0f;
        const ix0 = wrapI(ix0f, vecGridW);
        const iy0 = wrapI(iy0f, vecGridH);
        const ix1 = (ix0 + 1) % vecGridW;
        const iy1 = (iy0 + 1) % vecGridH;

        const vi00 = iy0 * vecColCount + ix0;
        const vi10 = iy0 * vecColCount + ix1;
        const vi01 = iy1 * vecColCount + ix0;
        const vi11 = iy1 * vecColCount + ix1;

        const vx0 = vecDirX[vi00] + (vecDirX[vi10] - vecDirX[vi00]) * tx;
        const vx1 = vecDirX[vi01] + (vecDirX[vi11] - vecDirX[vi01]) * tx;
        const vy0 = vecDirY[vi00] + (vecDirY[vi10] - vecDirY[vi00]) * tx;
        const vy1 = vecDirY[vi01] + (vecDirY[vi11] - vecDirY[vi01]) * tx;

        vxBuf[i] = vx0 + (vx1 - vx0) * ty;
        vyBuf[i] = vy0 + (vy1 - vy0) * ty;
      }
    }

    // Phase 2: transfer amounts
    for (let i = 0; i < totalPixels; i++) {
      qBuf[i] = transferRate * pixels[i];
    }

    // Phase 3: landing positions
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const px = x * cell;
        const py = y * cell;
        const hPrev = pixels[i];
        const cvx = vxBuf[i];
        const cvy = vyBuf[i];
        const m = Math.hypot(cvx, cvy);
        const nx = m ? cvx / m : 0;
        const ny = m ? cvy / m : 0;
        const L = m + transferRate * hPrev;
        const landX = px + nx * L;
        const landY = py + ny * L;
        const tc = wrapI(Math.round(landX / cell), cols);
        const tr = wrapI(Math.round(landY / cell), rows);
        tBuf[i] = tr * cols + tc;
      }
    }

    // Phase 4: apply transfers
    nextH.set(pixels);
    for (let i = 0; i < totalPixels; i++) {
      const q = qBuf[i];
      nextH[i] -= q;
      nextH[tBuf[i]] += q;
    }

    // Phase 4.5: pixel smoothing
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const l = y * cols + wrapI(x - 1, cols);
        const r = y * cols + wrapI(x + 1, cols);
        const u = wrapI(y - 1, rows) * cols + x;
        const d = wrapI(y + 1, rows) * cols + x;
        const hSelf = nextH[i];
        const hMean = (nextH[l] + nextH[r] + nextH[u] + nextH[d]) * 0.25;
        sBuf[i] = (1 - pixelSmoothVal) * hSelf + pixelSmoothVal * hMean;
      }
    }
    pixels.set(sBuf);
  }

  function stepSim() {
    simTime += turb;
    stepCount++;

    // Copy current vectors as baseline (boundaries preserved)
    tempVecX.set(vecDirX);
    tempVecY.set(vecDirY);

    // First pass: update interior vectors with noise
    for (let yi = 1; yi < vecRowCount - 1; yi++) {
      for (let xi = 1; xi < vecColCount - 1; xi++) {
        const idx = yi * vecColCount + xi;
        const nAng =
          noise3(
            vecPosX[idx] * noiseScale,
            vecPosY[idx] * noiseScale,
            simTime,
          ) * TWO_PI;
        const nx = Math.cos(nAng);
        const ny = Math.sin(nAng);
        let vx = dir.x * (1 - noiseInf) + nx * noiseInf;
        let vy = dir.y * (1 - noiseInf) + ny * noiseInf;
        const m = Math.hypot(vx, vy) || 1;
        vx = (vx / m) * windStrength;
        vy = (vy / m) * windStrength;
        tempVecX[idx] = vx;
        tempVecY[idx] = vy;
      }
    }

    // Second pass: spatial smoothing + coherence
    for (let yi = 1; yi < vecRowCount - 1; yi++) {
      for (let xi = 1; xi < vecColCount - 1; xi++) {
        const i = yi * vecColCount + xi;
        const vx = tempVecX[i];
        const vy = tempVecY[i];
        const lx = tempVecX[i - 1];
        const ly = tempVecY[i - 1];
        const rx = tempVecX[i + 1];
        const ry = tempVecY[i + 1];
        const ux = tempVecX[(yi - 1) * vecColCount + xi];
        const uy = tempVecY[(yi - 1) * vecColCount + xi];
        const dx = tempVecX[(yi + 1) * vecColCount + xi];
        const dy = tempVecY[(yi + 1) * vecColCount + xi];

        // Smooth (smooth=1.0 → full neighbor average)
        const ax = (lx + rx + ux + dx) * 0.25;
        const ay = (ly + ry + uy + dy) * 0.25;
        let svx = (1 - smooth) * vx + smooth * ax;
        let svy = (1 - smooth) * vy + smooth * ay;

        // Coherence
        const vm = Math.hypot(svx, svy) || 1;
        const vnx = svx / vm;
        const vny = svy / vm;

        const lm = Math.hypot(lx, ly) || 1;
        const rm = Math.hypot(rx, ry) || 1;
        const um = Math.hypot(ux, uy) || 1;
        const dm = Math.hypot(dx, dy) || 1;

        const align =
          (vnx * (lx / lm) +
            vny * (ly / lm) +
            vnx * (rx / rm) +
            vny * (ry / rm) +
            vnx * (ux / um) +
            vny * (uy / um) +
            vnx * (dx / dm) +
            vny * (dy / dm)) *
          0.25;

        let strength = windStrength * (1 + coherenceFactor * align);
        strength = Math.max(0.1, strength);
        const sm = Math.hypot(svx, svy) || 1;
        svx = (svx / sm) * strength;
        svy = (svy / sm) * strength;

        tempVecX[i] = svx;
        tempVecY[i] = svy;
      }
    }

    // Boundary wrapping
    for (let yi = 1; yi < vecRowCount - 1; yi++) {
      const row = yi * vecColCount;
      tempVecX[row] = tempVecX[row + vecColCount - 2];
      tempVecY[row] = tempVecY[row + vecColCount - 2];
      tempVecX[row + vecColCount - 1] = tempVecX[row + 1];
      tempVecY[row + vecColCount - 1] = tempVecY[row + 1];
    }
    for (let xi = 0; xi < vecColCount; xi++) {
      tempVecX[xi] = tempVecX[(vecRowCount - 2) * vecColCount + xi];
      tempVecY[xi] = tempVecY[(vecRowCount - 2) * vecColCount + xi];
      tempVecX[(vecRowCount - 1) * vecColCount + xi] =
        tempVecX[vecColCount + xi];
      tempVecY[(vecRowCount - 1) * vecColCount + xi] =
        tempVecY[vecColCount + xi];
    }

    // Apply to main vectors
    vecDirX.set(tempVecX);
    vecDirY.set(tempVecY);

    stepLed();
  }

  // --- Post-processing ---

  function blur(radius) {
    if (radius < 1) return;
    const r = Math.round(radius);
    const temp = new Float32Array(totalPixels);

    // Horizontal pass
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        let count = 0;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < cols) {
            sum += pixels[y * cols + nx];
            count++;
          }
        }
        temp[y * cols + x] = sum / count;
      }
    }
    // Vertical pass
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        let sum = 0;
        let count = 0;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < rows) {
            sum += temp[ny * cols + x];
            count++;
          }
        }
        pixels[y * cols + x] = sum / count;
      }
    }
  }

  // --- Init ---
  initPixels();
  initVecGrid();

  return {
    step() {
      stepSim();
    },
    stepN(n) {
      for (let i = 0; i < n; i++) stepSim();
    },
    getPixels() {
      return pixels;
    },
    getCols() {
      return cols;
    },
    getRows() {
      return rows;
    },
    getStepCount() {
      return stepCount;
    },

    setWindDirection(deg) {
      if (!Number.isFinite(deg)) return;
      const rad = (deg * Math.PI) / 180;
      dir = { x: Math.cos(rad), y: Math.sin(rad) };
    },
    setNoiseInfluence(v) {
      if (Number.isFinite(v)) noiseInf = v;
    },
    setTurbulence(v) {
      if (Number.isFinite(v)) turb = v;
    },
    setWindStrength(v) {
      if (Number.isFinite(v)) windStrength = v;
    },
    setTransferRate(v) {
      if (Number.isFinite(v)) transferRate = v;
    },
    setPixelSmooth(v) {
      if (Number.isFinite(v)) pixelSmoothVal = v;
    },

    blur,

    reset() {
      initPixels();
      initVecGrid();
      simTime = 0;
      stepCount = 0;
    },
  };
}
