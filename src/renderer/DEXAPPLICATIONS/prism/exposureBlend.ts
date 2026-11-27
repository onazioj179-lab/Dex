// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

/** Give more weight to midtones and ignore transparent pixels. */
export function blendExposurePixels(sources: readonly Uint8ClampedArray[], output: Uint8ClampedArray): void {
  for (let i = 0; i < output.length; i += 4) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    let totalWeight = 0;
    for (const source of sources) {
      const opacity = source[i + 3];
      if (!opacity) continue;
      const brightness = source[i] * 0.2126 + source[i + 1] * 0.7152 + source[i + 2] * 0.0722;
      const weight = opacity * (1 + Math.min(brightness, 255 - brightness)) ** 2;
      red += source[i] * weight;
      green += source[i + 1] * weight;
      blue += source[i + 2] * weight;
      totalWeight += weight;
      alpha = Math.max(alpha, opacity);
    }
    if (!totalWeight) continue;
    output[i] = red / totalWeight;
    output[i + 1] = green / totalWeight;
    output[i + 2] = blue / totalWeight;
    output[i + 3] = alpha;
  }
}

export async function blendExposureImages(files: readonly File[]): Promise<HTMLCanvasElement> {
  if (files.length < 2 || files.length > 4) throw new Error('Choose two to four images.');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Unable to open the image processor.');

  const sources: Uint8ClampedArray[] = [];
  for (const file of files) {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = bitmap;
      if (width * height > 12_000_000) throw new Error('Use images of 12 megapixels or smaller.');
      if (!sources.length) {
        canvas.width = width;
        canvas.height = height;
      } else if (width !== canvas.width || height !== canvas.height) {
        throw new Error('All images must have the same width and height.');
      }
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0);
      sources.push(context.getImageData(0, 0, width, height).data);
    } finally {
      bitmap.close();
    }
  }
  const result = context.createImageData(canvas.width, canvas.height);
  blendExposurePixels(sources, result.data);
  context.putImageData(result, 0, 0);
  return canvas;
}
