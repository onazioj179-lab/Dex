/**
 * DEX Platform
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Created by Onazi Treasure OJ <onazi75@gmail.com>
 * Licensed under the DEX Software License Agreement v1.0. See LICENSE.
 */
import type { Slide, SlideBlock } from './PresentationBuilder';

export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
export interface PresentationProject { format: 'dex-presentation'; version: 1; themeId: string; slides: Slide[] }
const color = (value: unknown): value is string => typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max = 1000000): value is string => typeof value === 'string' && value.length <= max;

export function safePresentationImage(value: string): boolean {
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/]+=*$/i.test(value)) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}

/** Rebuild known fields only; imported data cannot carry executable/native actions. */
export function parsePresentationProject(source: string): PresentationProject {
  if (new TextEncoder().encode(source).byteLength > MAX_PROJECT_BYTES) throw new Error('Project exceeds 16 MB.');
  const project = JSON.parse(source);
  if (project?.format !== 'dex-presentation' || project?.version !== 1 || !Array.isArray(project.slides)
    || !project.slides.length || project.slides.length > 500 || !text(project.themeId, 40)) throw new Error('Unsupported presentation project.');
  const slideIds = new Set<string>();
  const slides = project.slides.map((slide: any): Slide => {
    if (!text(slide?.id, 100) || !slide.id || slideIds.has(slide.id) || !color(slide.background)
      || !Array.isArray(slide.blocks) || slide.blocks.length > 1000 || !text(slide.notes ?? '')
      || !['none', 'fade', 'slide-left', 'slide-right', 'zoom'].includes(slide.transition)) throw new Error('Invalid slide data.');
    slideIds.add(slide.id);
    const ids = new Set<string>();
    const blocks = slide.blocks.map((block: any): SlideBlock => {
      if (!text(block?.id, 100) || !block.id || ids.has(block.id) || !['text', 'image', 'shape'].includes(block.type)
        || !number(block.x, 0, 960) || !number(block.y, 0, 540) || !number(block.width, 1, 960) || !number(block.height, 1, 540)
        || !text(block.content, MAX_PROJECT_BYTES) || !block.style || typeof block.style !== 'object') throw new Error('Invalid slide block.');
      if (block.type === 'image' && block.content && !safePresentationImage(block.content)) throw new Error('Unsupported image address.');
      ids.add(block.id);
      const style: SlideBlock['style'] = {};
      for (const key of ['color', 'background'] as const) {
        if (block.style[key] !== undefined) {
          if (!color(block.style[key])) throw new Error('Invalid block color.');
          style[key] = block.style[key];
        }
      }
      if (block.style.fontSize !== undefined) {
        if (!number(block.style.fontSize, 8, 200)) throw new Error('Invalid font size.');
        style.fontSize = block.style.fontSize;
      }
      if (block.style.fontWeight !== undefined) {
        if (!number(block.style.fontWeight, 100, 900)) throw new Error('Invalid font weight.');
        style.fontWeight = block.style.fontWeight;
      }
      return { id: block.id, type: block.type, x: block.x, y: block.y, width: block.width, height: block.height, content: block.content, style };
    });
    return { id: slide.id, background: slide.background, transition: slide.transition, notes: slide.notes ?? '', blocks,
      layout: ['title', 'title-content', 'two-column', 'blank'].includes(slide.layout) ? slide.layout : undefined };
  });
  return { format: 'dex-presentation', version: 1, themeId: project.themeId, slides };
}
