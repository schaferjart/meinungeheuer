/**
 * Integer-clean slicing. No half dots, ever.
 */

export function validate(totalDots, numSlices) {
  const remainder = totalDots % numSlices;
  return {
    valid: remainder === 0,
    sliceDots: Math.floor(totalDots / numSlices),
    remainder,
  };
}

export function getDivisors(n) {
  const divs = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) divs.push(i);
  }
  return divs;
}

export function slice(pixels, cols, rows, numSlices) {
  if (cols % numSlices !== 0) {
    throw new Error(
      `Cannot slice ${cols} cols into ${numSlices} equal parts (remainder: ${cols % numSlices})`,
    );
  }

  const sliceCols = cols / numSlices;
  const slices = [];

  for (let s = 0; s < numSlices; s++) {
    const startCol = s * sliceCols;
    const data = new Float32Array(sliceCols * rows);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < sliceCols; x++) {
        data[y * sliceCols + x] = pixels[y * cols + startCol + x];
      }
    }

    slices.push({ pixels: data, cols: sliceCols, rows, index: s });
  }

  return slices;
}
