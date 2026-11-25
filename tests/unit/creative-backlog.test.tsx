// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ColorPicker from '../../src/renderer/DEXAPPLICATIONS/standalone/ColorPicker';
import QRCodeGenerator from '../../src/renderer/DEXAPPLICATIONS/standalone/QRCodeGenerator';
import { sendCreativeInput, useCreativeInput } from '../../src/renderer/services/creativeIntake';
import { dominantSwatches, harmonize, mixSwatches, nearestColorName, paletteDocument, parseHexList, shadeRamp, simulateVision } from '../../src/shared/creative/paletteTools';
import { duplicateImageKey, galleryBreadcrumbs, galleryFolder, loadGalleryTags, moveAlbumItems, TAGS_KEY, tagMedia } from '../../src/renderer/pages/galleryOrganize';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Color Picker workflows', () => {
  it('keeps exact hex, recalls recents, locks hue and hands a swatch to the creative app', () => {
    let received = '';
    function Receiver() {
      useCreativeInput('canvas', value => { received = value; });
      return null;
    }
    const view = render(<><ColorPicker /><Receiver /></>);
    const hex = screen.getByRole('textbox', { name: 'Hex color value' });
    fireEvent.change(hex, { target: { value: '#123456' } });
    expect(hex).toHaveValue('#123456');
    fireEvent.click(screen.getByRole('button', { name: 'Send to Canvas' }));
    expect(received).toBe('#123456');
    fireEvent.click(screen.getByRole('button', { name: 'Lock hue' }));
    expect(screen.getByRole('slider', { name: 'Hue', exact: true })).toBeDisabled();
    fireEvent.change(hex, { target: { value: '#ff0000' } });
    expect(hex).not.toHaveValue('#ff0000');
    view.unmount();
    render(<ColorPicker />);
    expect(screen.getByRole('button', { name: 'Reuse recent color #123456' })).toBeInTheDocument();
  });

  it('samples an exact pixel and evaluates normal-text contrast against the chosen background', async () => {
    vi.stubGlobal('EyeDropper', class { async open() { return { sRGBHex: '#000001' }; } });
    render(<ColorPicker />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Eyedropper' })); });
    expect(screen.getByRole('textbox', { name: 'Hex color value' })).toHaveValue('#000001');
    expect(screen.getByText(/AAA for normal text/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Contrast background'), { target: { value: '#000001' } });
    expect(screen.getByText(/Below AA for normal text/)).toBeVisible();
  });

  it('saves and reopens a named hex-list palette', () => {
    const view = render(<ColorPicker />);
    fireEvent.click(screen.getByText('Named palettes'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Palette name' }), { target: { value: 'Studio' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Palette hex colors' }), { target: { value: '#abc, #123456, #ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save palette' }));
    view.unmount();
    render(<ColorPicker />);
    fireEvent.click(screen.getByText('Named palettes'));
    fireEvent.click(screen.getByRole('button', { name: 'Studio', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Palette hex colors' })).toHaveValue('#aabbcc\n#123456');
  });

  it('builds export documents, harmonies, shades, mixes and simulated swatches', () => {
    const colors = parseHexList('#f00; #abc BAD-COLOR');
    expect(colors).toEqual(['#ff0000', '#aabbcc']);
    expect(JSON.parse(paletteDocument('Samples', colors, 'json'))).toEqual({ name: 'Samples', colors });
    expect(paletteDocument('Samples', colors, 'css')).toContain('--swatch-2: #aabbcc;');
    expect(paletteDocument('Samples', colors, 'svg')).toContain('fill="#aabbcc"');
    expect(harmonize('#ff0000', { h: 0, s: 100, l: 50 }, 'Triadic')).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(shadeRamp('#ff0000')[3]).toBe('#ff0000');
    expect(mixSwatches('#ff0000', '#0000ff', 0.5)).toBe('#800080');
    expect(simulateVision('#ff0000', 'Protanopia')).toBe('#6d5f00');
    expect(simulateVision('#ffffff', 'Tritanopia')).toBe('#ffffff');
    expect(nearestColorName('#663399')).toBe('Rebecca Purple');
    expect(dominantSwatches(new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,255,0,0])))
      .toEqual(['#ff0000', '#0000ff']);
  });
});

describe('Gallery organization and handoff', () => {
  it('restores tags, deduplicates case-insensitive batch tags and moves selected album items', () => {
    const tags = tagMedia({ first: ['Travel'] }, ['first', 'second'], 'travel');
    expect(tags).toEqual({ first: ['Travel'], second: ['travel'] });
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
    expect(loadGalleryTags()).toEqual(tags);
    const from = { id: 'one', name: 'Trips', itemIds: ['first', 'second'], createdAt: 0 };
    const to = { id: 'two', name: 'Archive', itemIds: [], createdAt: 0 };
    const result = moveAlbumItems([from, to], from, 'Archive', ['second', 'missing']);
    expect(result.map(album => album.itemIds)).toEqual([['first'], ['second']]);
    const fullName = { ...from, name: 'a'.repeat(60) };
    expect(moveAlbumItems([fullName], fullName, fullName.name + 'b', ['second'])).toEqual([fullName]);
  });

  it('keeps folder breadcrumb paths and groups likely filename copies by size', () => {
    expect(galleryFolder('C:\\Pictures\\Trips\\beach.jpg')).toBe('C:/Pictures/Trips');
    expect(galleryBreadcrumbs('C:\\Pictures\\Trips\\beach.jpg').at(-1)).toEqual({ label: 'Trips', path: 'C:/Pictures/Trips' });
    const image = { type: 'image', name: 'beach.jpg', size: 100 };
    expect(duplicateImageKey({ ...image, name: 'beach (1).jpg' })).toBe(duplicateImageKey(image));
    expect(duplicateImageKey({ ...image, size: 101 })).not.toBe(duplicateImageKey(image));
    expect(duplicateImageKey({ ...image, type: 'video' })).toBeNull();
  });

  it('opens a queued image data payload in the QR encoder', () => {
    const data = 'data:image/jpeg;base64,AAAB';
    sendCreativeInput('qrcode', data);
    render(<QRCodeGenerator />);
    expect(screen.getByRole('textbox', { name: 'Text to encode' })).toHaveValue(data);
  });
});
