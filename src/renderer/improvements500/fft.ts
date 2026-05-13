// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Iterative Cooley-Tukey radix-2 FFT (in-place on complex arrays).
 * Input length must be a power of two.
 */

export interface ComplexArray {
  real: Float64Array;
  imag: Float64Array;
}

function bitReverse(n: number, bits: number): number {
  let r = 0;
  let v = n;
  for (let i = 0; i < bits; i += 1) {
    r = (r << 1) | (v & 1);
    v >>>= 1;
  }
  return r;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function fft(input: ComplexArray): ComplexArray {
  const n = input.real.length;
  if (!isPowerOfTwo(n)) throw new Error('FFT length must be a power of two');
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  const bits = Math.log2(n) | 0;
  for (let i = 0; i < n; i += 1) {
    const j = bitReverse(i, bits);
    real[j] = input.real[i]!;
    imag[j] = input.imag[i]!;
  }
  for (let size = 2; size <= n; size *= 2) {
    const halfsize = size / 2;
    const tablestep = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + halfsize; j += 1, k += tablestep) {
        const angle = (-2 * Math.PI * k) / n;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tre = real[j + halfsize]! * cos - imag[j + halfsize]! * sin;
        const tim = real[j + halfsize]! * sin + imag[j + halfsize]! * cos;
        real[j + halfsize] = real[j]! - tre;
        imag[j + halfsize] = imag[j]! - tim;
        real[j] = real[j]! + tre;
        imag[j] = imag[j]! + tim;
      }
    }
  }
  return { real, imag };
}

export function ifft(input: ComplexArray): ComplexArray {
  const n = input.real.length;
  // Conjugate, FFT, conjugate, scale.
  const conj: ComplexArray = { real: input.real.slice(), imag: new Float64Array(n) };
  for (let i = 0; i < n; i += 1) conj.imag[i] = -input.imag[i]!;
  const out = fft(conj);
  for (let i = 0; i < n; i += 1) {
    out.real[i] = out.real[i]! / n;
    out.imag[i] = -out.imag[i]! / n;
  }
  return out;
}

export function fftFromReal(values: readonly number[]): ComplexArray {
  const n = values.length;
  const real = new Float64Array(n);
  for (let i = 0; i < n; i += 1) real[i] = values[i]!;
  return fft({ real, imag: new Float64Array(n) });
}
