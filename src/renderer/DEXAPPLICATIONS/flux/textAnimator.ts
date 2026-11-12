/**
 * Flux Text Animator: per character / word / line reveal.
 *
 * The Text Animator panel used to store a preset that nothing read (the text
 * drew all at once). A text layer with `textAnimator` is now drawn unit by
 * unit: unit i starts `i × cascade` ms after the layer's in-point and runs the
 * preset over UNIT_MS.
 */

export type TextAnimMode = 'character' | 'word' | 'line';
export type TextAnimPreset = 'Typewriter' | 'Fade Up' | 'Scale Pop' | 'Rotate In' | 'Slide Left' | 'Blur Reveal';
export const TEXT_ANIM_PRESETS: TextAnimPreset[] = ['Typewriter', 'Fade Up', 'Scale Pop', 'Rotate In', 'Slide Left', 'Blur Reveal'];

export interface TextAnimator { mode: TextAnimMode; cascade: number; preset: TextAnimPreset }

export const UNIT_MS = 400;

export interface UnitState { opacity: number; dx: number; dy: number; scale: number; rotation: number; blur: number }

const HIDDEN: UnitState = { opacity: 0, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0 };
const SHOWN: UnitState = { opacity: 1, dx: 0, dy: 0, scale: 1, rotation: 0, blur: 0 };

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Lines of text, each split into units for the mode (spaces stay attached so widths add up). */
export function splitUnits(text: string, mode: TextAnimMode): string[][] {
  const lines = text.split('\n');
  if (mode === 'line') return lines.map(l => [l]);
  if (mode === 'word') return lines.map(l => l.match(/\S+\s*|\s+/g) ?? ['']);
  return lines.map(l => (l.length ? Array.from(l) : ['']));
}

/** State of unit `index` at `ms` after the layer's in-point. */
export function unitState(preset: TextAnimPreset, ms: number, index: number, cascadeMs: number): UnitState {
  const start = index * Math.max(0, cascadeMs);
  if (ms < start) return HIDDEN;
  if (preset === 'Typewriter') return SHOWN;
  const raw = Math.min(1, (ms - start) / UNIT_MS);
  if (raw >= 1) return SHOWN;
  const p = easeOutCubic(raw);
  switch (preset) {
    case 'Fade Up': return { ...SHOWN, opacity: p, dy: (1 - p) * 30 };
    case 'Scale Pop': return { ...SHOWN, opacity: Math.min(1, raw * 3), scale: Math.max(0, easeOutBack(raw)) };
    case 'Rotate In': return { ...SHOWN, opacity: p, rotation: -180 * (1 - p) };
    case 'Slide Left': return { ...SHOWN, opacity: p, dx: (1 - p) * 200 };
    case 'Blur Reveal': return { ...SHOWN, opacity: p, blur: Math.round((1 - p) * 12 * 10) / 10 };
    default: return SHOWN;
  }
}

/** Time in ms until every unit has finished (for timeline hints). */
export function totalDurationMs(text: string, anim: TextAnimator): number {
  const n = splitUnits(text, anim.mode).reduce((a, l) => a + l.length, 0);
  return Math.max(0, n - 1) * Math.max(0, anim.cascade) + (anim.preset === 'Typewriter' ? 0 : UNIT_MS);
}

type TextCtx = Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'translate' | 'rotate' | 'scale' | 'fillText' | 'measureText' | 'textAlign' | 'globalAlpha' | 'filter'>;

/**
 * Draw `text` centred like the plain text path (textBaseline middle, origin at
 * the layer anchor), one unit at a time. Caller sets font and fillStyle.
 */
export function drawAnimatedText(
  ctx: TextCtx, text: string, anim: TextAnimator, ms: number, align: CanvasTextAlign, lineHeight: number,
): void {
  const lines = splitUnits(text, anim.mode);
  const baseAlpha = ctx.globalAlpha;
  const baseFilter = ctx.filter && ctx.filter !== 'none' ? ctx.filter : '';
  let index = 0;
  const top = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((units, li) => {
    const widths = units.map(u => ctx.measureText(u).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = align === 'left' || align === 'start' ? 0 : align === 'right' || align === 'end' ? -total : -total / 2;
    const y = top + li * lineHeight;
    units.forEach((u, ui) => {
      const st = unitState(anim.preset, ms, index++, anim.cascade);
      const w = widths[ui];
      if (st.opacity > 0 && u.trim()) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.globalAlpha = baseAlpha * st.opacity;
        if (st.blur > 0) ctx.filter = `${baseFilter} blur(${st.blur}px)`.trim();
        ctx.translate(x + w / 2 + st.dx, y + st.dy);
        if (st.rotation) ctx.rotate((st.rotation * Math.PI) / 180);
        if (st.scale !== 1) ctx.scale(st.scale, st.scale);
        ctx.fillText(u, 0, 0);
        ctx.restore();
      }
      x += w;
    });
  });
}
