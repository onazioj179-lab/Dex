// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React, { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import { colorInputValue } from '../../utils/canvasTheme';
import { saveBlobAs } from '../../services/nativeSave';
import { contrastRatio, type HSL } from '../../../shared/creative/colorUtils';
import {
  dominantSwatches, harmonize, harmonyOffsets, mixSwatches, paletteDocument,
  parseHexList, shadeRamp, simulateVision, visionModes, type PaletteFormat,
} from '../../../shared/creative/paletteTools';

type Palette = { name: string; colors: string[] };
const STORAGE = 'dex-colorpicker-palettes-v1';
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 };
const formats: PaletteFormat[] = ['json', 'css', 'svg'];

function loadPalettes(): Palette[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.slice(0, 24).flatMap(item => {
      if (typeof item?.name !== 'string' || !Array.isArray(item.colors)) return [];
      const colors = parseHexList(item.colors.join(' '));
      return colors.length ? [{ name: item.name.slice(0, 60), colors }] : [];
    });
  } catch { return []; }
}

async function readImagePalette(file: File) {
  if (!file.type.startsWith('image/') || file.size > 25_000_000) throw new Error('Choose an image under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = 96 / Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Image sampling is unavailable.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return dominantSwatches(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ColorWorkbench({ hex, hsl, pick, copy }: {
  hex: string; hsl: HSL; pick: (hex: string) => void; copy: (value: string) => void;
}) {
  const [background, setBackground] = useState('#ffffff');
  const [second, setSecond] = useState('#ffc43d');
  const [weight, setWeight] = useState(50);
  const [angle, setAngle] = useState(90);
  const [harmony, setHarmony] = useState<keyof typeof harmonyOffsets>('Complementary');
  const [draft, setDraft] = useState('');
  const [name, setName] = useState('');
  const [palettes, setPalettes] = useState(loadPalettes);
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [format, setFormat] = useState<PaletteFormat>('json');
  const colors = parseHexList(draft);
  const ratio = contrastRatio(hex, background);
  const gradient = 'linear-gradient(' + angle + 'deg, ' + hex + ', ' + second + ')';
  const mixed = mixSwatches(hex, second, weight / 100);
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(palettes)); } catch { /* Current session remains usable. */ }
  }, [palettes]);

  const swatches = (values: string[], label: string) => (
    <div role="group" aria-label={label} style={row}>
      {values.map((color, index) => <button type="button" key={index} onClick={() => pick(color)}
        aria-label={'Use ' + color} title={color}
        style={{ width: 30, height: 28, background: color, border: '1px solid var(--color-border-strong)',
          borderRadius: 6, cursor: 'pointer' }} />)}
    </div>
  );
  const extract = async (file?: File) => {
    if (!file || reading) return;
    setReading(true);
    setMessage('');
    try {
      const result = await readImagePalette(file);
      if (!result.length) { setMessage('This image has no opaque colors.'); return; }
      setDraft(result.join('\n'));
      setMessage('Extracted ' + result.length + ' swatches.');
    } catch { setMessage('Could not sample this image. Choose a supported image under 25 MB.'); }
    finally { setReading(false); }
  };
  const add = (values: string[]) => setDraft(previous => parseHexList([previous, ...values].join(' ')).join('\n'));
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title || !colors.length) return;
    setPalettes(previous => [{ name: title, colors }, ...previous.filter(palette => palette.name.toLowerCase() !== title.toLowerCase())].slice(0, 24));
    setMessage('Saved ' + title);
  };
  const exportPalette = async (palette: Palette) => {
    const mime = { json: 'application/json', css: 'text/css', svg: 'image/svg+xml' }[format];
    const filename = palette.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'palette';
    try {
      await saveBlobAs(filename + '.' + format, new Blob([paletteDocument(palette.name, palette.colors, format)], { type: mime }),
        { title: 'Export palette', source: 'Color Picker' });
    } catch { setMessage('Palette export failed.'); }
  };

  return <div style={{ display: 'grid', gap: 10 }}>
    <details open>
      <summary>Contrast and color vision</summary>
      <div style={row}>
        <label>Background <input type="color" aria-label="Contrast background" value={colorInputValue(background)} onChange={event => setBackground(event.target.value)} /></label>
        <span style={{ background, color: hex, padding: '3px 8px', borderRadius: 4 }}>Sample text</span>
        <output aria-live="polite">{ratio.toFixed(2)}:1 · {ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Below AA'} for normal text</output>
      </div>
      <div style={row}>
        {visionModes.map(mode => {
          const sample = simulateVision(hex, mode);
          return <span key={mode} style={row}><i aria-hidden="true" style={{ background: sample, width: 18, height: 18, borderRadius: 4 }} />
            {mode} {sample}</span>;
        })}
      </div>
    </details>

    <details>
      <summary>Harmonies and shades</summary>
      <div style={row}>
        <label>Harmony <select value={harmony} onChange={event => setHarmony(event.target.value as keyof typeof harmonyOffsets)}>
          {Object.keys(harmonyOffsets).map(mode => <option key={mode}>{mode}</option>)}
        </select></label>
        {swatches(harmonize(hex, hsl, harmony), 'Harmony swatches')}
        <Button size="sm" onClick={() => add(harmonize(hex, hsl, harmony))}>Add harmony to palette</Button>
      </div>
      <div style={row}>{swatches(shadeRamp(hex), 'Shades and tints')}
        <Button size="sm" onClick={() => add(shadeRamp(hex))}>Add ramp to palette</Button>
      </div>
    </details>

    <details>
      <summary>Mix and gradient</summary>
      <div style={row}>
        <label>Second color <input type="color" value={colorInputValue(second)} onChange={event => setSecond(event.target.value)} /></label>
        <label>Mix {weight}% <input type="range" aria-label="Mix ratio" value={weight} onChange={event => setWeight(+event.target.value)} /></label>
        {swatches([mixed], 'Mixed color')}
        <Button size="sm" onClick={() => pick(mixed)}>Use mix</Button>
      </div>
      <div style={row}>
        <label>Angle {angle}° <input type="range" aria-label="Gradient angle" min={0} max={360} value={angle} onChange={event => setAngle(+event.target.value)} /></label>
        <Button size="sm" onClick={() => copy(gradient)}>Copy gradient CSS</Button>
      </div>
      <div role="img" aria-label="Gradient preview" style={{ background: gradient, height: 42, borderRadius: 6, marginTop: 6 }} />
    </details>

    <details>
      <summary>Named palettes</summary>
      <div style={{ display: 'grid', gap: 8, paddingTop: 6 }} onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); void extract(event.dataTransfer.files[0]); }}>
        <div style={row}>
          <label>Extract colors from an image <input type="file" accept="image/*" disabled={reading} onChange={event => {
            void extract(event.target.files?.[0]);
            event.target.value = '';
          }} /></label>
          <Button size="sm" onClick={() => add([hex])}>Add current color</Button>
          <Button size="sm" onClick={async () => {
            try {
              const incoming = parseHexList(await navigator.clipboard.readText());
              if (!incoming.length) { setMessage('No hex colors found in the clipboard.'); return; }
              add(incoming);
              setMessage('Imported clipboard colors.');
            } catch { setMessage('Paste the hex list into the palette field.'); }
          }}>Import clipboard</Button>
        </div>
        <textarea aria-label="Palette hex colors" placeholder="#0a84ff, #ffd60a" value={draft} maxLength={2048}
          onChange={event => setDraft(event.target.value)} />
        {swatches(colors, 'Palette draft')}
        <form style={row} onSubmit={save}>
          <input aria-label="Palette name" placeholder="Palette name" value={name} maxLength={60} onChange={event => setName(event.target.value)} />
          <Button type="submit" size="sm" disabled={!name.trim() || !colors.length}>Save palette</Button>
        </form>
        <label>Export format <select value={format} onChange={event => setFormat(event.target.value as PaletteFormat)}>
          {formats.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select></label>
        {palettes.map(palette => <div key={palette.name} style={row}>
          <Button size="sm" onClick={() => { setName(palette.name); setDraft(palette.colors.join('\n')); }}>{palette.name}</Button>
          {swatches(palette.colors, palette.name + ' swatches')}
          <Button size="sm" onClick={() => void exportPalette(palette)} aria-label={'Export ' + palette.name}>Export</Button>
          <Button size="sm" onClick={() => setPalettes(previous => previous.filter(item => item.name !== palette.name))}
            aria-label={'Delete palette ' + palette.name}>Remove</Button>
        </div>)}
        <output aria-live="polite">{reading ? 'Sampling image…' : message}</output>
      </div>
    </details>
  </div>;
}
