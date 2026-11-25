// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { pickUkiVoice, readVoicePrefs, writeVoicePref, stepRate, speakableText, DEFAULT_RATE } from '../../src/renderer/uki/voice';

const v = (name: string, lang: string) => ({ name, lang, voiceURI: name });
const WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Microsoft George - English (United Kingdom)', 'en-GB'),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'),
  v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB'),
];

beforeEach(() => localStorage.clear());

describe('UKI voice', () => {
  it('prefers a neural British woman, then Hazel, then any female English voice', () => {
    expect(pickUkiVoice(WINDOWS)?.name).toMatch(/Sonia/);
    expect(pickUkiVoice(WINDOWS.filter((x) => !/Sonia/.test(x.name)))?.name).toMatch(/Hazel/);
    expect(pickUkiVoice([WINDOWS[0], WINDOWS[1]])?.name).toMatch(/Zira/);
    expect(pickUkiVoice([])).toBeNull();
  });

  it('honours an explicit voice and the male choice', () => {
    expect(pickUkiVoice(WINDOWS, { voiceURI: WINDOWS[0].voiceURI })?.name).toMatch(/David/);
    expect(pickUkiVoice(WINDOWS, { gender: 'male' })?.lang).toBe('en-GB');
  });

  it('reads and writes the Settings values', () => {
    expect(readVoicePrefs().rate).toBe(DEFAULT_RATE);
    writeVoicePref('ukiVoiceRate', 1.5);
    localStorage.setItem('dex-settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('dex-settings')!), ukiVoicePitch: 9 }));
    expect(readVoicePrefs()).toMatchObject({ rate: 1.5, pitch: 2, gender: 'female' });
  });

  it('steps the speed', () => {
    expect(stepRate(1, 1)).toBe(1.1);
    expect(stepRate(1.05, -1)).toBe(1);
    expect(stepRate(1.5, 1)).toBe(1.5);
    expect(stepRate(0.8, -1)).toBe(0.8);
  });

  it('does not read markdown, code or links aloud', () => {
    expect(speakableText('**Done.** See [the doc](https://x.y) and run `npm i`.\n```js\nx()\n```'))
      .toBe('Done. See the doc and run npm i. (code omitted)');
  });
});
