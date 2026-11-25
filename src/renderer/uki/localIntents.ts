// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI's on-device intent checks (no AI provider needed): local time / date
 * questions and the tone of a message. Kept pure so they are tested.
 *
 * Fixed 2026-11: "what time is it" (the most common phrasing, and the example
 * UKI itself suggests) did not match, and every question starting with
 * "what" / "how do I" / "explain" was read as confusion, so answers opened with
 * "No worries, let me explain."
 */

export type EmotionType = 'frustration' | 'happiness' | 'sadness' | 'confusion' | 'neutral';

const TIME_WORD = '(?:time|tiem|tmie)';

/** The local clock: "what time is it", "what's the time", "time now", "current time". Not "time in Tokyo". */
export function isLocalTimeQuestion(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[?!.]+$/, '');
  if (/\b(?:in|at)\s+[a-z]/.test(t.replace(/^.*?\btime\b/, ''))) return false; // "time in Tokyo" -> world time lookup
  if (/^(?:time|tiem|tmie|current time|time now|the time)$/.test(t)) return true;
  return new RegExp(
    `^(?:hey uki,? |uki,? )?(?:(?:can you |could you )?(?:tell me |give me )?(?:the )?(?:current )?${TIME_WORD}(?: now| please)?`
    + `|what(?:'s| is)? (?:the )?(?:current )?${TIME_WORD}(?: is it)?(?: now| right now)?`
    + `|what ${TIME_WORD} (?:is it|it is)(?: now| right now)?`
    + `|do you (?:know|have) the ${TIME_WORD})$`,
  ).test(t);
}

/** Today's date: "what's the date", "what is today's date", "what date is it", "today". */
export function isDateQuestion(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[?!.]+$/, '');
  if (/^(?:date|dat|dtae|today|todya|today's date|todays date)$/.test(t)) return true;
  return /^(?:what(?:'s| is)? (?:the |today(?:'s|s)? )?(?:date|dat|dtae)(?: today| is it)?|what date is (?:it|today)|what is today)$/.test(t);
}

/** Tone of a message. Only clear signals count; ordinary questions are neutral. */
export function detectEmotion(text: string): EmotionType {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean).length;
  if (/\b(ugh|argh|wtf|damn|broken|stupid|useless|not working|doesn't work|doesnt work|fuck|sucks|terrible|awful)\b/.test(lower)) return 'frustration';
  // Thanks / praise: a short message that is mostly that ("thanks!", "that's perfect").
  if (words <= 6 && /\b(thank|thanks|thx|great|awesome|amazing|perfect|yay|brilliant|excellent|wonderful|nice one|love it)\b/.test(lower)) return 'happiness';
  if (/\b(i'?m (?:sad|upset|depressed|lonely|anxious|stressed|worried)|feeling (?:sad|down|lonely|anxious|stressed)|crying)\b/.test(lower)) return 'sadness';
  if (/^(huh\b|i don.?t understand|i'?m confused|confused\b|what do you mean)/.test(lower)) return 'confusion';
  return 'neutral';
}
