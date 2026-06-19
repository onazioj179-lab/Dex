// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Emoji Picker v3.7.3
 * 
 * Full-featured emoji picker with categories, search, skin tones, and recent emojis.
 * Uses Unicode 15 emoji set organized by standard categories.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { space, radius, fontSize, zIndex, transition } from '../styles/tokens';
import { DexSearchInput } from '../styles/components';

// ---------------------------------------------------------------------------
// Emoji Data Structure
// ---------------------------------------------------------------------------
interface EmojiData {
  emoji: string;
  name: string;
  keywords?: string[];
}

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: EmojiData[];
}

// Skin tone modifiers
const skinTones = [
  { id: 'default', name: 'Default', modifier: '' },
  { id: 'light', name: 'Light', modifier: '\u{1F3FB}' },
  { id: 'medium-light', name: 'Medium-Light', modifier: '\u{1F3FC}' },
  { id: 'medium', name: 'Medium', modifier: '\u{1F3FD}' },
  { id: 'medium-dark', name: 'Medium-Dark', modifier: '\u{1F3FE}' },
  { id: 'dark', name: 'Dark', modifier: '\u{1F3FF}' },
] as const;

// Emojis that support skin tones (simplified list - commonly used)
const skinToneSupported = new Set([
  '\u{1F44D}', '\u{1F44E}', '\u{1F44B}', '\u{270B}', '\u{1F64B}', '\u{1F64C}', '\u{1F64F}',
  '\u{1F466}', '\u{1F467}', '\u{1F468}', '\u{1F469}', '\u{1F474}', '\u{1F475}', '\u{1F476}',
  '\u{1F485}', '\u{1F4AA}', '\u{1F933}', '\u{1F91A}', '\u{1F91B}', '\u{1F91C}', '\u{1F91D}',
  '\u{1F91E}', '\u{1F91F}', '\u{1F918}', '\u{1F919}', '\u{270C}', '\u{1F596}', '\u{1F448}',
  '\u{1F449}', '\u{1F446}', '\u{1F447}', '\u{261D}', '\u{1F590}', '\u{1F595}', '\u{270D}',
]);

// Categories with emoji data
const emojiCategories: EmojiCategory[] = [
  {
    id: 'recent',
    name: 'Recent',
    icon: '\u{1F552}',
    emojis: [], // Filled from localStorage
  },
  {
    id: 'smileys',
    name: 'Smileys & People',
    icon: '\u{1F600}',
    emojis: [
      { emoji: '\u{1F600}', name: 'grinning face', keywords: ['happy', 'smile'] },
      { emoji: '\u{1F603}', name: 'grinning face with big eyes', keywords: ['happy', 'joy'] },
      { emoji: '\u{1F604}', name: 'grinning face with smiling eyes', keywords: ['happy'] },
      { emoji: '\u{1F601}', name: 'beaming face with smiling eyes', keywords: ['happy', 'smile'] },
      { emoji: '\u{1F606}', name: 'grinning squinting face', keywords: ['laugh', 'happy'] },
      { emoji: '\u{1F605}', name: 'grinning face with sweat', keywords: ['hot', 'relief'] },
      { emoji: '\u{1F923}', name: 'rolling on the floor laughing', keywords: ['rofl', 'lol'] },
      { emoji: '\u{1F602}', name: 'face with tears of joy', keywords: ['lol', 'cry', 'laugh'] },
      { emoji: '\u{1F642}', name: 'slightly smiling face', keywords: ['smile'] },
      { emoji: '\u{1F643}', name: 'upside-down face', keywords: ['silly', 'sarcasm'] },
      { emoji: '\u{1FAE0}', name: 'melting face', keywords: ['hot', 'melt', 'embarrassed'] },
      { emoji: '\u{1F609}', name: 'winking face', keywords: ['wink', 'flirt'] },
      { emoji: '\u{1F60A}', name: 'smiling face with smiling eyes', keywords: ['blush', 'happy'] },
      { emoji: '\u{1F607}', name: 'smiling face with halo', keywords: ['angel', 'innocent'] },
      { emoji: '\u{1F970}', name: 'smiling face with hearts', keywords: ['love', 'adore'] },
      { emoji: '\u{1F60D}', name: 'smiling face with heart-eyes', keywords: ['love', 'crush'] },
      { emoji: '\u{1F929}', name: 'star-struck', keywords: ['star', 'eyes', 'wow'] },
      { emoji: '\u{1F618}', name: 'face blowing a kiss', keywords: ['kiss', 'love'] },
      { emoji: '\u{1F617}', name: 'kissing face', keywords: ['kiss'] },
      { emoji: '\u{1F61A}', name: 'kissing face with closed eyes', keywords: ['kiss'] },
      { emoji: '\u{1F619}', name: 'kissing face with smiling eyes', keywords: ['kiss'] },
      { emoji: '\u{1F60B}', name: 'face savoring food', keywords: ['yum', 'delicious'] },
      { emoji: '\u{1F61B}', name: 'face with tongue', keywords: ['tongue', 'playful'] },
      { emoji: '\u{1F61C}', name: 'winking face with tongue', keywords: ['playful', 'crazy'] },
      { emoji: '\u{1F92A}', name: 'zany face', keywords: ['crazy', 'wild'] },
      { emoji: '\u{1F61D}', name: 'squinting face with tongue', keywords: ['playful'] },
      { emoji: '\u{1F911}', name: 'money-mouth face', keywords: ['rich', 'money'] },
      { emoji: '\u{1F917}', name: 'hugging face', keywords: ['hug', 'embrace'] },
      { emoji: '\u{1F92D}', name: 'face with hand over mouth', keywords: ['oops', 'giggle'] },
      { emoji: '\u{1FAE2}', name: 'face with open eyes and hand over mouth', keywords: ['shock'] },
      { emoji: '\u{1FAE3}', name: 'face with peeking eye', keywords: ['peek', 'scared'] },
      { emoji: '\u{1F92B}', name: 'shushing face', keywords: ['quiet', 'secret'] },
      { emoji: '\u{1F914}', name: 'thinking face', keywords: ['think', 'hmm'] },
      { emoji: '\u{1FAE1}', name: 'saluting face', keywords: ['salute', 'respect'] },
      { emoji: '\u{1F910}', name: 'zipper-mouth face', keywords: ['secret', 'quiet'] },
      { emoji: '\u{1F928}', name: 'face with raised eyebrow', keywords: ['skeptical', 'doubt'] },
      { emoji: '\u{1F610}', name: 'neutral face', keywords: ['meh', 'indifferent'] },
      { emoji: '\u{1F611}', name: 'expressionless face', keywords: ['blank', 'meh'] },
      { emoji: '\u{1F636}', name: 'face without mouth', keywords: ['silent', 'quiet'] },
      { emoji: '\u{1FAE5}', name: 'dotted line face', keywords: ['invisible', 'hidden'] },
      { emoji: '\u{1F60F}', name: 'smirking face', keywords: ['smirk', 'flirt'] },
      { emoji: '\u{1F612}', name: 'unamused face', keywords: ['meh', 'unimpressed'] },
      { emoji: '\u{1F644}', name: 'face with rolling eyes', keywords: ['eyeroll', 'whatever'] },
      { emoji: '\u{1F62C}', name: 'grimacing face', keywords: ['awkward', 'nervous'] },
      { emoji: '\u{1F62E}\u{200D}\u{1F4A8}', name: 'face exhaling', keywords: ['sigh', 'relief'] },
      { emoji: '\u{1F925}', name: 'lying face', keywords: ['lie', 'pinocchio'] },
      { emoji: '\u{1F60C}', name: 'relieved face', keywords: ['relief', 'calm'] },
      { emoji: '\u{1F614}', name: 'pensive face', keywords: ['sad', 'thoughtful'] },
      { emoji: '\u{1F62A}', name: 'sleepy face', keywords: ['tired', 'sleepy'] },
      { emoji: '\u{1F924}', name: 'drooling face', keywords: ['drool', 'hungry'] },
      { emoji: '\u{1F634}', name: 'sleeping face', keywords: ['sleep', 'zzz'] },
      { emoji: '\u{1F637}', name: 'face with medical mask', keywords: ['sick', 'mask'] },
      { emoji: '\u{1F912}', name: 'face with thermometer', keywords: ['sick', 'fever'] },
      { emoji: '\u{1F915}', name: 'face with head-bandage', keywords: ['hurt', 'injured'] },
      { emoji: '\u{1F922}', name: 'nauseated face', keywords: ['sick', 'vomit'] },
      { emoji: '\u{1F92E}', name: 'face vomiting', keywords: ['vomit', 'sick'] },
      { emoji: '\u{1F927}', name: 'sneezing face', keywords: ['sneeze', 'sick'] },
      { emoji: '\u{1F975}', name: 'hot face', keywords: ['hot', 'sweating'] },
      { emoji: '\u{1F976}', name: 'cold face', keywords: ['cold', 'freezing'] },
      { emoji: '\u{1F974}', name: 'woozy face', keywords: ['drunk', 'dizzy'] },
      { emoji: '\u{1F635}', name: 'face with crossed-out eyes', keywords: ['dead', 'ko'] },
      { emoji: '\u{1F92F}', name: 'exploding head', keywords: ['mind blown', 'shock'] },
      { emoji: '\u{1F920}', name: 'cowboy hat face', keywords: ['cowboy', 'yeehaw'] },
      { emoji: '\u{1F973}', name: 'partying face', keywords: ['party', 'celebrate'] },
      { emoji: '\u{1F978}', name: 'disguised face', keywords: ['disguise', 'incognito'] },
      { emoji: '\u{1F60E}', name: 'smiling face with sunglasses', keywords: ['cool', 'sunglasses'] },
      { emoji: '\u{1F913}', name: 'nerd face', keywords: ['nerd', 'glasses'] },
      { emoji: '\u{1F9D0}', name: 'face with monocle', keywords: ['fancy', 'inspect'] },
      { emoji: '\u{1F615}', name: 'confused face', keywords: ['confused', 'huh'] },
      { emoji: '\u{1FAE4}', name: 'face with diagonal mouth', keywords: ['meh', 'skeptical'] },
      { emoji: '\u{1F61F}', name: 'worried face', keywords: ['worried', 'concern'] },
      { emoji: '\u{1F641}', name: 'slightly frowning face', keywords: ['sad', 'frown'] },
      { emoji: '\u{1F62E}', name: 'face with open mouth', keywords: ['surprise', 'wow'] },
      { emoji: '\u{1F62F}', name: 'hushed face', keywords: ['wow', 'surprise'] },
      { emoji: '\u{1F632}', name: 'astonished face', keywords: ['shock', 'wow'] },
      { emoji: '\u{1F633}', name: 'flushed face', keywords: ['embarrassed', 'blush'] },
      { emoji: '\u{1F97A}', name: 'pleading face', keywords: ['please', 'puppy eyes'] },
      { emoji: '\u{1F979}', name: 'face holding back tears', keywords: ['sad', 'emotional'] },
      { emoji: '\u{1F626}', name: 'frowning face with open mouth', keywords: ['sad', 'shocked'] },
      { emoji: '\u{1F627}', name: 'anguished face', keywords: ['pain', 'anguish'] },
      { emoji: '\u{1F628}', name: 'fearful face', keywords: ['scared', 'fear'] },
      { emoji: '\u{1F630}', name: 'anxious face with sweat', keywords: ['anxious', 'nervous'] },
      { emoji: '\u{1F625}', name: 'sad but relieved face', keywords: ['phew', 'relieved'] },
      { emoji: '\u{1F622}', name: 'crying face', keywords: ['cry', 'sad'] },
      { emoji: '\u{1F62D}', name: 'loudly crying face', keywords: ['cry', 'sob'] },
      { emoji: '\u{1F631}', name: 'face screaming in fear', keywords: ['scream', 'horror'] },
      { emoji: '\u{1F616}', name: 'confounded face', keywords: ['confused', 'frustrated'] },
      { emoji: '\u{1F623}', name: 'persevering face', keywords: ['struggle', 'endure'] },
      { emoji: '\u{1F61E}', name: 'disappointed face', keywords: ['sad', 'disappointed'] },
      { emoji: '\u{1F613}', name: 'downcast face with sweat', keywords: ['tired', 'hard work'] },
      { emoji: '\u{1F629}', name: 'weary face', keywords: ['tired', 'frustrated'] },
      { emoji: '\u{1F62B}', name: 'tired face', keywords: ['tired', 'exhausted'] },
      { emoji: '\u{1F971}', name: 'yawning face', keywords: ['tired', 'sleepy'] },
      { emoji: '\u{1F624}', name: 'face with steam from nose', keywords: ['angry', 'triumph'] },
      { emoji: '\u{1F621}', name: 'pouting face', keywords: ['angry', 'rage'] },
      { emoji: '\u{1F620}', name: 'angry face', keywords: ['angry', 'mad'] },
      { emoji: '\u{1F92C}', name: 'face with symbols on mouth', keywords: ['swear', 'angry'] },
      { emoji: '\u{1F608}', name: 'smiling face with horns', keywords: ['devil', 'evil'] },
      { emoji: '\u{1F47F}', name: 'angry face with horns', keywords: ['devil', 'angry'] },
      { emoji: '\u{1F480}', name: 'skull', keywords: ['death', 'dead'] },
      { emoji: '\u{1F4A9}', name: 'pile of poo', keywords: ['poop', 'shit'] },
      { emoji: '\u{1F921}', name: 'clown face', keywords: ['clown', 'fool'] },
      { emoji: '\u{1F479}', name: 'ogre', keywords: ['monster', 'scary'] },
      { emoji: '\u{1F47A}', name: 'goblin', keywords: ['monster', 'scary'] },
      { emoji: '\u{1F47B}', name: 'ghost', keywords: ['ghost', 'spooky'] },
      { emoji: '\u{1F47D}', name: 'alien', keywords: ['alien', 'ufo'] },
      { emoji: '\u{1F47E}', name: 'alien monster', keywords: ['alien', 'game', 'space invader'] },
      { emoji: '\u{1F916}', name: 'robot', keywords: ['robot', 'bot'] },
      { emoji: '\u{1F63A}', name: 'grinning cat', keywords: ['cat', 'happy'] },
      { emoji: '\u{1F638}', name: 'grinning cat with smiling eyes', keywords: ['cat', 'happy'] },
      { emoji: '\u{1F639}', name: 'cat with tears of joy', keywords: ['cat', 'laugh'] },
      { emoji: '\u{1F63B}', name: 'smiling cat with heart-eyes', keywords: ['cat', 'love'] },
      { emoji: '\u{1F63C}', name: 'cat with wry smile', keywords: ['cat', 'smirk'] },
      { emoji: '\u{1F63D}', name: 'kissing cat', keywords: ['cat', 'kiss'] },
      { emoji: '\u{1F640}', name: 'weary cat', keywords: ['cat', 'shocked'] },
      { emoji: '\u{1F63F}', name: 'crying cat', keywords: ['cat', 'sad'] },
      { emoji: '\u{1F63E}', name: 'pouting cat', keywords: ['cat', 'angry'] },
      { emoji: '\u{1F648}', name: 'see-no-evil monkey', keywords: ['monkey', 'blind'] },
      { emoji: '\u{1F649}', name: 'hear-no-evil monkey', keywords: ['monkey', 'deaf'] },
      { emoji: '\u{1F64A}', name: 'speak-no-evil monkey', keywords: ['monkey', 'mute'] },
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures & Body',
    icon: '\u{1F44D}',
    emojis: [
      { emoji: '\u{1F44B}', name: 'waving hand', keywords: ['wave', 'hi', 'bye'] },
      { emoji: '\u{1F91A}', name: 'raised back of hand', keywords: ['hand'] },
      { emoji: '\u{1F590}', name: 'hand with fingers splayed', keywords: ['hand', 'five'] },
      { emoji: '\u{270B}', name: 'raised hand', keywords: ['hand', 'stop'] },
      { emoji: '\u{1F596}', name: 'vulcan salute', keywords: ['spock', 'star trek'] },
      { emoji: '\u{1FAF1}', name: 'rightwards hand', keywords: ['hand', 'right'] },
      { emoji: '\u{1FAF2}', name: 'leftwards hand', keywords: ['hand', 'left'] },
      { emoji: '\u{1FAF3}', name: 'palm down hand', keywords: ['hand', 'down'] },
      { emoji: '\u{1FAF4}', name: 'palm up hand', keywords: ['hand', 'up'] },
      { emoji: '\u{1F44C}', name: 'ok hand', keywords: ['ok', 'perfect'] },
      { emoji: '\u{1F90C}', name: 'pinched fingers', keywords: ['italian', 'chef kiss'] },
      { emoji: '\u{1F90F}', name: 'pinching hand', keywords: ['small', 'tiny'] },
      { emoji: '\u{270C}', name: 'victory hand', keywords: ['peace', 'victory'] },
      { emoji: '\u{1F91E}', name: 'crossed fingers', keywords: ['luck', 'hope'] },
      { emoji: '\u{1FAF0}', name: 'hand with index finger and thumb crossed', keywords: ['love', 'money'] },
      { emoji: '\u{1F91F}', name: 'love-you gesture', keywords: ['love', 'ily'] },
      { emoji: '\u{1F918}', name: 'sign of the horns', keywords: ['rock', 'metal'] },
      { emoji: '\u{1F919}', name: 'call me hand', keywords: ['call', 'shaka'] },
      { emoji: '\u{1F448}', name: 'backhand index pointing left', keywords: ['left', 'point'] },
      { emoji: '\u{1F449}', name: 'backhand index pointing right', keywords: ['right', 'point'] },
      { emoji: '\u{1F446}', name: 'backhand index pointing up', keywords: ['up', 'point'] },
      { emoji: '\u{1F595}', name: 'middle finger', keywords: ['flip off', 'rude'] },
      { emoji: '\u{1F447}', name: 'backhand index pointing down', keywords: ['down', 'point'] },
      { emoji: '\u{261D}', name: 'index pointing up', keywords: ['point', 'one'] },
      { emoji: '\u{1FAF5}', name: 'index pointing at the viewer', keywords: ['you', 'point'] },
      { emoji: '\u{1F44D}', name: 'thumbs up', keywords: ['like', 'yes', 'good'] },
      { emoji: '\u{1F44E}', name: 'thumbs down', keywords: ['dislike', 'no', 'bad'] },
      { emoji: '\u{270A}', name: 'raised fist', keywords: ['fist', 'power'] },
      { emoji: '\u{1F44A}', name: 'oncoming fist', keywords: ['punch', 'fist bump'] },
      { emoji: '\u{1F91B}', name: 'left-facing fist', keywords: ['fist bump'] },
      { emoji: '\u{1F91C}', name: 'right-facing fist', keywords: ['fist bump'] },
      { emoji: '\u{1F44F}', name: 'clapping hands', keywords: ['clap', 'applause'] },
      { emoji: '\u{1F64C}', name: 'raising hands', keywords: ['celebrate', 'praise'] },
      { emoji: '\u{1FAF6}', name: 'heart hands', keywords: ['love', 'heart'] },
      { emoji: '\u{1F450}', name: 'open hands', keywords: ['hands', 'jazz hands'] },
      { emoji: '\u{1F932}', name: 'palms up together', keywords: ['prayer', 'namaste'] },
      { emoji: '\u{1F91D}', name: 'handshake', keywords: ['deal', 'agreement'] },
      { emoji: '\u{1F64F}', name: 'folded hands', keywords: ['pray', 'please', 'thank you'] },
      { emoji: '\u{270D}', name: 'writing hand', keywords: ['write', 'pen'] },
      { emoji: '\u{1F485}', name: 'nail polish', keywords: ['nails', 'beauty'] },
      { emoji: '\u{1F933}', name: 'selfie', keywords: ['selfie', 'photo'] },
      { emoji: '\u{1F4AA}', name: 'flexed biceps', keywords: ['strong', 'muscle'] },
      { emoji: '\u{1F9BE}', name: 'mechanical arm', keywords: ['robot', 'prosthetic'] },
      { emoji: '\u{1F9BF}', name: 'mechanical leg', keywords: ['robot', 'prosthetic'] },
      { emoji: '\u{1F9B5}', name: 'leg', keywords: ['leg', 'limb'] },
      { emoji: '\u{1F9B6}', name: 'foot', keywords: ['foot', 'kick'] },
      { emoji: '\u{1F442}', name: 'ear', keywords: ['ear', 'listen'] },
      { emoji: '\u{1F9BB}', name: 'ear with hearing aid', keywords: ['deaf', 'hearing'] },
      { emoji: '\u{1F443}', name: 'nose', keywords: ['nose', 'smell'] },
      { emoji: '\u{1F9E0}', name: 'brain', keywords: ['brain', 'think'] },
      { emoji: '\u{1FAC0}', name: 'anatomical heart', keywords: ['heart', 'organ'] },
      { emoji: '\u{1FAC1}', name: 'lungs', keywords: ['lungs', 'breathe'] },
      { emoji: '\u{1F9B7}', name: 'tooth', keywords: ['tooth', 'dentist'] },
      { emoji: '\u{1F9B4}', name: 'bone', keywords: ['bone', 'skeleton'] },
      { emoji: '\u{1F440}', name: 'eyes', keywords: ['eyes', 'look'] },
      { emoji: '\u{1F441}', name: 'eye', keywords: ['eye', 'see'] },
      { emoji: '\u{1F445}', name: 'tongue', keywords: ['tongue', 'taste'] },
      { emoji: '\u{1F444}', name: 'mouth', keywords: ['mouth', 'lips'] },
      { emoji: '\u{1FAE6}', name: 'biting lip', keywords: ['flirt', 'nervous'] },
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Love',
    icon: '\u{2764}',
    emojis: [
      { emoji: '\u{2764}', name: 'red heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F9E1}', name: 'orange heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F49B}', name: 'yellow heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F49A}', name: 'green heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F499}', name: 'blue heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F49C}', name: 'purple heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F90E}', name: 'brown heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F5A4}', name: 'black heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1FA76}', name: 'grey heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F90D}', name: 'white heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1FA77}', name: 'pink heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1FA78}', name: 'light blue heart', keywords: ['love', 'heart'] },
      { emoji: '\u{1F48C}', name: 'love letter', keywords: ['letter', 'love'] },
      { emoji: '\u{1F498}', name: 'heart with arrow', keywords: ['cupid', 'love'] },
      { emoji: '\u{1F49D}', name: 'heart with ribbon', keywords: ['gift', 'love'] },
      { emoji: '\u{1F496}', name: 'sparkling heart', keywords: ['love', 'sparkle'] },
      { emoji: '\u{1F497}', name: 'growing heart', keywords: ['love', 'growing'] },
      { emoji: '\u{1F493}', name: 'beating heart', keywords: ['love', 'heartbeat'] },
      { emoji: '\u{1F49E}', name: 'revolving hearts', keywords: ['love', 'romance'] },
      { emoji: '\u{1F495}', name: 'two hearts', keywords: ['love', 'couple'] },
      { emoji: '\u{1F48B}', name: 'kiss mark', keywords: ['kiss', 'lips'] },
      { emoji: '\u{1F48F}', name: 'kiss', keywords: ['kiss', 'couple'] },
      { emoji: '\u{1F491}', name: 'couple with heart', keywords: ['love', 'couple'] },
      { emoji: '\u{1F46A}', name: 'family', keywords: ['family', 'parents'] },
    ],
  },
  {
    id: 'nature',
    name: 'Animals & Nature',
    icon: '\u{1F436}',
    emojis: [
      { emoji: '\u{1F436}', name: 'dog face', keywords: ['dog', 'puppy', 'pet'] },
      { emoji: '\u{1F431}', name: 'cat face', keywords: ['cat', 'kitten', 'pet'] },
      { emoji: '\u{1F42D}', name: 'mouse face', keywords: ['mouse', 'rodent'] },
      { emoji: '\u{1F439}', name: 'hamster', keywords: ['hamster', 'pet'] },
      { emoji: '\u{1F430}', name: 'rabbit face', keywords: ['rabbit', 'bunny'] },
      { emoji: '\u{1F98A}', name: 'fox', keywords: ['fox', 'animal'] },
      { emoji: '\u{1F43B}', name: 'bear', keywords: ['bear', 'animal'] },
      { emoji: '\u{1F43C}', name: 'panda', keywords: ['panda', 'animal'] },
      { emoji: '\u{1F428}', name: 'koala', keywords: ['koala', 'animal'] },
      { emoji: '\u{1F42F}', name: 'tiger face', keywords: ['tiger', 'animal'] },
      { emoji: '\u{1F981}', name: 'lion', keywords: ['lion', 'king'] },
      { emoji: '\u{1F42E}', name: 'cow face', keywords: ['cow', 'animal'] },
      { emoji: '\u{1F437}', name: 'pig face', keywords: ['pig', 'animal'] },
      { emoji: '\u{1F438}', name: 'frog', keywords: ['frog', 'toad'] },
      { emoji: '\u{1F435}', name: 'monkey face', keywords: ['monkey', 'ape'] },
      { emoji: '\u{1F412}', name: 'monkey', keywords: ['monkey', 'ape'] },
      { emoji: '\u{1F98D}', name: 'gorilla', keywords: ['gorilla', 'ape'] },
      { emoji: '\u{1F9A7}', name: 'orangutan', keywords: ['orangutan', 'ape'] },
      { emoji: '\u{1F415}', name: 'dog', keywords: ['dog', 'pet'] },
      { emoji: '\u{1F429}', name: 'poodle', keywords: ['dog', 'poodle'] },
      { emoji: '\u{1F43A}', name: 'wolf', keywords: ['wolf', 'animal'] },
      { emoji: '\u{1F98B}', name: 'butterfly', keywords: ['butterfly', 'insect'] },
      { emoji: '\u{1F41D}', name: 'honeybee', keywords: ['bee', 'insect'] },
      { emoji: '\u{1F41B}', name: 'bug', keywords: ['bug', 'insect'] },
      { emoji: '\u{1F41C}', name: 'ant', keywords: ['ant', 'insect'] },
      { emoji: '\u{1F41E}', name: 'lady beetle', keywords: ['ladybug', 'insect'] },
      { emoji: '\u{1F577}', name: 'spider', keywords: ['spider', 'insect'] },
      { emoji: '\u{1F422}', name: 'turtle', keywords: ['turtle', 'animal'] },
      { emoji: '\u{1F40D}', name: 'snake', keywords: ['snake', 'reptile'] },
      { emoji: '\u{1F98E}', name: 'lizard', keywords: ['lizard', 'reptile'] },
      { emoji: '\u{1F996}', name: 'T-Rex', keywords: ['dinosaur', 'trex'] },
      { emoji: '\u{1F995}', name: 'sauropod', keywords: ['dinosaur'] },
      { emoji: '\u{1F433}', name: 'spouting whale', keywords: ['whale', 'ocean'] },
      { emoji: '\u{1F40B}', name: 'whale', keywords: ['whale', 'ocean'] },
      { emoji: '\u{1F42C}', name: 'dolphin', keywords: ['dolphin', 'ocean'] },
      { emoji: '\u{1F9AD}', name: 'seal', keywords: ['seal', 'ocean'] },
      { emoji: '\u{1F41F}', name: 'fish', keywords: ['fish', 'ocean'] },
      { emoji: '\u{1F420}', name: 'tropical fish', keywords: ['fish', 'ocean'] },
      { emoji: '\u{1F421}', name: 'blowfish', keywords: ['fish', 'ocean'] },
      { emoji: '\u{1F988}', name: 'shark', keywords: ['shark', 'ocean'] },
      { emoji: '\u{1F419}', name: 'octopus', keywords: ['octopus', 'ocean'] },
      { emoji: '\u{1F41A}', name: 'spiral shell', keywords: ['shell', 'ocean'] },
      { emoji: '\u{1F426}', name: 'bird', keywords: ['bird', 'flying'] },
      { emoji: '\u{1F427}', name: 'penguin', keywords: ['penguin', 'bird'] },
      { emoji: '\u{1F985}', name: 'eagle', keywords: ['eagle', 'bird'] },
      { emoji: '\u{1F986}', name: 'duck', keywords: ['duck', 'bird'] },
      { emoji: '\u{1F989}', name: 'owl', keywords: ['owl', 'bird'] },
      { emoji: '\u{1F99A}', name: 'peacock', keywords: ['peacock', 'bird'] },
      { emoji: '\u{1F99C}', name: 'parrot', keywords: ['parrot', 'bird'] },
      { emoji: '\u{1F331}', name: 'seedling', keywords: ['plant', 'grow'] },
      { emoji: '\u{1F332}', name: 'evergreen tree', keywords: ['tree', 'nature'] },
      { emoji: '\u{1F333}', name: 'deciduous tree', keywords: ['tree', 'nature'] },
      { emoji: '\u{1F334}', name: 'palm tree', keywords: ['palm', 'beach'] },
      { emoji: '\u{1F335}', name: 'cactus', keywords: ['cactus', 'desert'] },
      { emoji: '\u{1F33B}', name: 'sunflower', keywords: ['flower', 'sun'] },
      { emoji: '\u{1F337}', name: 'tulip', keywords: ['flower', 'spring'] },
      { emoji: '\u{1F339}', name: 'rose', keywords: ['rose', 'flower', 'love'] },
      { emoji: '\u{1F33A}', name: 'hibiscus', keywords: ['flower', 'tropical'] },
      { emoji: '\u{1F338}', name: 'cherry blossom', keywords: ['flower', 'spring'] },
      { emoji: '\u{1F33C}', name: 'blossom', keywords: ['flower'] },
      { emoji: '\u{1F340}', name: 'four leaf clover', keywords: ['luck', 'clover'] },
      { emoji: '\u{1F341}', name: 'maple leaf', keywords: ['leaf', 'fall'] },
      { emoji: '\u{1F342}', name: 'fallen leaf', keywords: ['leaf', 'autumn'] },
      { emoji: '\u{1F343}', name: 'leaf fluttering in wind', keywords: ['leaf', 'wind'] },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '\u{1F354}',
    emojis: [
      { emoji: '\u{1F34E}', name: 'red apple', keywords: ['apple', 'fruit'] },
      { emoji: '\u{1F34F}', name: 'green apple', keywords: ['apple', 'fruit'] },
      { emoji: '\u{1F34A}', name: 'tangerine', keywords: ['orange', 'fruit'] },
      { emoji: '\u{1F34B}', name: 'lemon', keywords: ['lemon', 'fruit'] },
      { emoji: '\u{1F34C}', name: 'banana', keywords: ['banana', 'fruit'] },
      { emoji: '\u{1F349}', name: 'watermelon', keywords: ['watermelon', 'fruit'] },
      { emoji: '\u{1F347}', name: 'grapes', keywords: ['grapes', 'fruit'] },
      { emoji: '\u{1F353}', name: 'strawberry', keywords: ['strawberry', 'fruit'] },
      { emoji: '\u{1FAD0}', name: 'blueberries', keywords: ['blueberry', 'fruit'] },
      { emoji: '\u{1F352}', name: 'cherries', keywords: ['cherry', 'fruit'] },
      { emoji: '\u{1F351}', name: 'peach', keywords: ['peach', 'fruit'] },
      { emoji: '\u{1F34D}', name: 'pineapple', keywords: ['pineapple', 'fruit'] },
      { emoji: '\u{1F965}', name: 'coconut', keywords: ['coconut', 'fruit'] },
      { emoji: '\u{1F96D}', name: 'mango', keywords: ['mango', 'fruit'] },
      { emoji: '\u{1F951}', name: 'avocado', keywords: ['avocado', 'guacamole'] },
      { emoji: '\u{1F346}', name: 'eggplant', keywords: ['eggplant', 'vegetable'] },
      { emoji: '\u{1F954}', name: 'potato', keywords: ['potato', 'vegetable'] },
      { emoji: '\u{1F955}', name: 'carrot', keywords: ['carrot', 'vegetable'] },
      { emoji: '\u{1F33D}', name: 'ear of corn', keywords: ['corn', 'vegetable'] },
      { emoji: '\u{1F336}', name: 'hot pepper', keywords: ['pepper', 'spicy'] },
      { emoji: '\u{1F952}', name: 'cucumber', keywords: ['cucumber', 'vegetable'] },
      { emoji: '\u{1F966}', name: 'broccoli', keywords: ['broccoli', 'vegetable'] },
      { emoji: '\u{1F9C5}', name: 'onion', keywords: ['onion', 'vegetable'] },
      { emoji: '\u{1F9C4}', name: 'garlic', keywords: ['garlic', 'vegetable'] },
      { emoji: '\u{1F344}', name: 'mushroom', keywords: ['mushroom'] },
      { emoji: '\u{1F950}', name: 'croissant', keywords: ['croissant', 'bread'] },
      { emoji: '\u{1F956}', name: 'baguette bread', keywords: ['bread', 'french'] },
      { emoji: '\u{1F35E}', name: 'bread', keywords: ['bread', 'loaf'] },
      { emoji: '\u{1F96F}', name: 'bagel', keywords: ['bagel', 'bread'] },
      { emoji: '\u{1F95E}', name: 'pancakes', keywords: ['pancake', 'breakfast'] },
      { emoji: '\u{1F9C7}', name: 'waffle', keywords: ['waffle', 'breakfast'] },
      { emoji: '\u{1F9C0}', name: 'cheese wedge', keywords: ['cheese'] },
      { emoji: '\u{1F356}', name: 'meat on bone', keywords: ['meat'] },
      { emoji: '\u{1F357}', name: 'poultry leg', keywords: ['chicken', 'turkey'] },
      { emoji: '\u{1F969}', name: 'cut of meat', keywords: ['steak', 'meat'] },
      { emoji: '\u{1F953}', name: 'bacon', keywords: ['bacon', 'breakfast'] },
      { emoji: '\u{1F354}', name: 'hamburger', keywords: ['burger', 'fast food'] },
      { emoji: '\u{1F35F}', name: 'french fries', keywords: ['fries', 'fast food'] },
      { emoji: '\u{1F355}', name: 'pizza', keywords: ['pizza', 'fast food'] },
      { emoji: '\u{1F32D}', name: 'hot dog', keywords: ['hotdog', 'fast food'] },
      { emoji: '\u{1F96A}', name: 'sandwich', keywords: ['sandwich', 'lunch'] },
      { emoji: '\u{1F32E}', name: 'taco', keywords: ['taco', 'mexican'] },
      { emoji: '\u{1F32F}', name: 'burrito', keywords: ['burrito', 'mexican'] },
      { emoji: '\u{1FAD4}', name: 'tamale', keywords: ['tamale', 'mexican'] },
      { emoji: '\u{1F959}', name: 'stuffed flatbread', keywords: ['pita', 'wrap'] },
      { emoji: '\u{1F9C6}', name: 'falafel', keywords: ['falafel', 'middle eastern'] },
      { emoji: '\u{1F95A}', name: 'egg', keywords: ['egg', 'breakfast'] },
      { emoji: '\u{1F373}', name: 'cooking', keywords: ['egg', 'frying pan'] },
      { emoji: '\u{1F958}', name: 'shallow pan of food', keywords: ['paella', 'pan'] },
      { emoji: '\u{1F372}', name: 'pot of food', keywords: ['stew', 'soup'] },
      { emoji: '\u{1FAD5}', name: 'fondue', keywords: ['fondue', 'cheese'] },
      { emoji: '\u{1F963}', name: 'bowl with spoon', keywords: ['soup', 'cereal'] },
      { emoji: '\u{1F957}', name: 'green salad', keywords: ['salad', 'healthy'] },
      { emoji: '\u{1F37F}', name: 'popcorn', keywords: ['popcorn', 'movie'] },
      { emoji: '\u{1F9C8}', name: 'butter', keywords: ['butter'] },
      { emoji: '\u{1F9C2}', name: 'salt', keywords: ['salt', 'seasoning'] },
      { emoji: '\u{1F96B}', name: 'canned food', keywords: ['canned', 'food'] },
      { emoji: '\u{1F371}', name: 'bento box', keywords: ['bento', 'japanese'] },
      { emoji: '\u{1F35B}', name: 'curry rice', keywords: ['curry', 'rice'] },
      { emoji: '\u{1F35C}', name: 'steaming bowl', keywords: ['ramen', 'noodles'] },
      { emoji: '\u{1F35D}', name: 'spaghetti', keywords: ['pasta', 'italian'] },
      { emoji: '\u{1F360}', name: 'roasted sweet potato', keywords: ['sweet potato'] },
      { emoji: '\u{1F362}', name: 'oden', keywords: ['oden', 'japanese'] },
      { emoji: '\u{1F363}', name: 'sushi', keywords: ['sushi', 'japanese'] },
      { emoji: '\u{1F364}', name: 'fried shrimp', keywords: ['tempura', 'shrimp'] },
      { emoji: '\u{1F365}', name: 'fish cake with swirl', keywords: ['narutomaki'] },
      { emoji: '\u{1F96E}', name: 'moon cake', keywords: ['mooncake', 'chinese'] },
      { emoji: '\u{1F961}', name: 'takeout box', keywords: ['takeout', 'chinese'] },
      { emoji: '\u{1F366}', name: 'soft ice cream', keywords: ['ice cream', 'dessert'] },
      { emoji: '\u{1F367}', name: 'shaved ice', keywords: ['shaved ice', 'dessert'] },
      { emoji: '\u{1F368}', name: 'ice cream', keywords: ['ice cream', 'dessert'] },
      { emoji: '\u{1F369}', name: 'doughnut', keywords: ['donut', 'dessert'] },
      { emoji: '\u{1F36A}', name: 'cookie', keywords: ['cookie', 'dessert'] },
      { emoji: '\u{1F382}', name: 'birthday cake', keywords: ['cake', 'birthday'] },
      { emoji: '\u{1F370}', name: 'shortcake', keywords: ['cake', 'dessert'] },
      { emoji: '\u{1F9C1}', name: 'cupcake', keywords: ['cupcake', 'dessert'] },
      { emoji: '\u{1F967}', name: 'pie', keywords: ['pie', 'dessert'] },
      { emoji: '\u{1F36B}', name: 'chocolate bar', keywords: ['chocolate'] },
      { emoji: '\u{1F36C}', name: 'candy', keywords: ['candy', 'sweet'] },
      { emoji: '\u{1F36D}', name: 'lollipop', keywords: ['lollipop', 'candy'] },
      { emoji: '\u{1F36E}', name: 'custard', keywords: ['pudding', 'dessert'] },
      { emoji: '\u{1F36F}', name: 'honey pot', keywords: ['honey'] },
      { emoji: '\u{1F37C}', name: 'baby bottle', keywords: ['baby', 'milk'] },
      { emoji: '\u{1F95B}', name: 'glass of milk', keywords: ['milk'] },
      { emoji: '\u{2615}', name: 'hot beverage', keywords: ['coffee', 'tea'] },
      { emoji: '\u{1FAD6}', name: 'teapot', keywords: ['tea', 'teapot'] },
      { emoji: '\u{1F375}', name: 'teacup without handle', keywords: ['tea', 'green tea'] },
      { emoji: '\u{1F376}', name: 'sake', keywords: ['sake', 'japanese'] },
      { emoji: '\u{1F37E}', name: 'bottle with popping cork', keywords: ['champagne', 'celebrate'] },
      { emoji: '\u{1F377}', name: 'wine glass', keywords: ['wine', 'drink'] },
      { emoji: '\u{1F378}', name: 'cocktail glass', keywords: ['cocktail', 'drink'] },
      { emoji: '\u{1F379}', name: 'tropical drink', keywords: ['drink', 'tropical'] },
      { emoji: '\u{1F37A}', name: 'beer mug', keywords: ['beer', 'drink'] },
      { emoji: '\u{1F37B}', name: 'clinking beer mugs', keywords: ['beer', 'cheers'] },
      { emoji: '\u{1F942}', name: 'clinking glasses', keywords: ['cheers', 'toast'] },
      { emoji: '\u{1F943}', name: 'tumbler glass', keywords: ['whiskey', 'drink'] },
      { emoji: '\u{1FAD7}', name: 'pouring liquid', keywords: ['pour', 'drink'] },
      { emoji: '\u{1F964}', name: 'cup with straw', keywords: ['soda', 'drink'] },
      { emoji: '\u{1F9CB}', name: 'bubble tea', keywords: ['boba', 'milk tea'] },
      { emoji: '\u{1F9C3}', name: 'beverage box', keywords: ['juice box'] },
      { emoji: '\u{1F9C9}', name: 'mate', keywords: ['mate', 'yerba'] },
      { emoji: '\u{1F9CA}', name: 'ice', keywords: ['ice', 'cube'] },
      { emoji: '\u{1F962}', name: 'chopsticks', keywords: ['chopsticks', 'asian'] },
      { emoji: '\u{1F37D}', name: 'fork and knife with plate', keywords: ['dining', 'meal'] },
      { emoji: '\u{1F374}', name: 'fork and knife', keywords: ['dining', 'meal'] },
      { emoji: '\u{1F944}', name: 'spoon', keywords: ['spoon', 'utensil'] },
    ],
  },
  {
    id: 'activities',
    name: 'Activities',
    icon: '\u{26BD}',
    emojis: [
      { emoji: '\u{26BD}', name: 'soccer ball', keywords: ['soccer', 'football', 'sport'] },
      { emoji: '\u{1F3C0}', name: 'basketball', keywords: ['basketball', 'sport'] },
      { emoji: '\u{1F3C8}', name: 'american football', keywords: ['football', 'sport'] },
      { emoji: '\u{26BE}', name: 'baseball', keywords: ['baseball', 'sport'] },
      { emoji: '\u{1F94E}', name: 'softball', keywords: ['softball', 'sport'] },
      { emoji: '\u{1F3BE}', name: 'tennis', keywords: ['tennis', 'sport'] },
      { emoji: '\u{1F3D0}', name: 'volleyball', keywords: ['volleyball', 'sport'] },
      { emoji: '\u{1F3C9}', name: 'rugby football', keywords: ['rugby', 'sport'] },
      { emoji: '\u{1F94F}', name: 'flying disc', keywords: ['frisbee', 'sport'] },
      { emoji: '\u{1F3B1}', name: 'pool 8 ball', keywords: ['pool', 'billiards'] },
      { emoji: '\u{1F3D3}', name: 'ping pong', keywords: ['table tennis', 'sport'] },
      { emoji: '\u{1F3F8}', name: 'badminton', keywords: ['badminton', 'sport'] },
      { emoji: '\u{1F94A}', name: 'boxing glove', keywords: ['boxing', 'sport'] },
      { emoji: '\u{1F94B}', name: 'martial arts uniform', keywords: ['karate', 'martial arts'] },
      { emoji: '\u{1F945}', name: 'goal net', keywords: ['goal', 'sport'] },
      { emoji: '\u{26F3}', name: 'flag in hole', keywords: ['golf', 'sport'] },
      { emoji: '\u{26F8}', name: 'ice skate', keywords: ['ice skating', 'sport'] },
      { emoji: '\u{1F3A3}', name: 'fishing pole', keywords: ['fishing'] },
      { emoji: '\u{1F93F}', name: 'diving mask', keywords: ['diving', 'snorkeling'] },
      { emoji: '\u{1F3BD}', name: 'running shirt', keywords: ['running', 'sport'] },
      { emoji: '\u{1F3BF}', name: 'skis', keywords: ['skiing', 'winter'] },
      { emoji: '\u{1F6F7}', name: 'sled', keywords: ['sled', 'winter'] },
      { emoji: '\u{1F94C}', name: 'curling stone', keywords: ['curling', 'sport'] },
      { emoji: '\u{1F3AF}', name: 'bullseye', keywords: ['darts', 'target'] },
      { emoji: '\u{1FA80}', name: 'yo-yo', keywords: ['yo-yo', 'toy'] },
      { emoji: '\u{1FA81}', name: 'kite', keywords: ['kite', 'flying'] },
      { emoji: '\u{1F52B}', name: 'water pistol', keywords: ['water gun', 'toy'] },
      { emoji: '\u{1F3B0}', name: 'slot machine', keywords: ['casino', 'gambling'] },
      { emoji: '\u{1F3B2}', name: 'game die', keywords: ['dice', 'game'] },
      { emoji: '\u{1F9E9}', name: 'puzzle piece', keywords: ['puzzle', 'game'] },
      { emoji: '\u{1F9F8}', name: 'teddy bear', keywords: ['teddy', 'toy'] },
      { emoji: '\u{1FA85}', name: 'pinata', keywords: ['pinata', 'party'] },
      { emoji: '\u{1FAA9}', name: 'mirror ball', keywords: ['disco', 'party'] },
      { emoji: '\u{1FA86}', name: 'nesting dolls', keywords: ['matryoshka', 'doll'] },
      { emoji: '\u{265F}', name: 'chess pawn', keywords: ['chess', 'game'] },
      { emoji: '\u{1F0CF}', name: 'joker', keywords: ['card', 'joker'] },
      { emoji: '\u{1F004}', name: 'mahjong red dragon', keywords: ['mahjong', 'game'] },
      { emoji: '\u{1F3B4}', name: 'flower playing cards', keywords: ['cards', 'hanafuda'] },
      { emoji: '\u{1F3AD}', name: 'performing arts', keywords: ['theater', 'drama'] },
      { emoji: '\u{1F5BC}', name: 'framed picture', keywords: ['art', 'painting'] },
      { emoji: '\u{1F3A8}', name: 'artist palette', keywords: ['art', 'paint'] },
      { emoji: '\u{1F9F5}', name: 'thread', keywords: ['sewing', 'thread'] },
      { emoji: '\u{1FAA1}', name: 'sewing needle', keywords: ['sewing', 'needle'] },
      { emoji: '\u{1F9F6}', name: 'yarn', keywords: ['knitting', 'yarn'] },
      { emoji: '\u{1FAA2}', name: 'knot', keywords: ['knot', 'rope'] },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: '\u{2708}',
    emojis: [
      { emoji: '\u{1F697}', name: 'automobile', keywords: ['car', 'vehicle'] },
      { emoji: '\u{1F695}', name: 'taxi', keywords: ['taxi', 'cab'] },
      { emoji: '\u{1F699}', name: 'sport utility vehicle', keywords: ['suv', 'car'] },
      { emoji: '\u{1F68C}', name: 'bus', keywords: ['bus', 'vehicle'] },
      { emoji: '\u{1F3CE}', name: 'racing car', keywords: ['race', 'car'] },
      { emoji: '\u{1F6F5}', name: 'motor scooter', keywords: ['scooter', 'vespa'] },
      { emoji: '\u{1F3CD}', name: 'motorcycle', keywords: ['motorcycle', 'bike'] },
      { emoji: '\u{1F6B2}', name: 'bicycle', keywords: ['bicycle', 'bike'] },
      { emoji: '\u{1F6F4}', name: 'kick scooter', keywords: ['scooter'] },
      { emoji: '\u{1F6EB}', name: 'airplane departure', keywords: ['airplane', 'flight'] },
      { emoji: '\u{1F6EC}', name: 'airplane arrival', keywords: ['airplane', 'landing'] },
      { emoji: '\u{2708}', name: 'airplane', keywords: ['plane', 'flight'] },
      { emoji: '\u{1F681}', name: 'helicopter', keywords: ['helicopter', 'flight'] },
      { emoji: '\u{1F680}', name: 'rocket', keywords: ['rocket', 'space'] },
      { emoji: '\u{1F6F8}', name: 'flying saucer', keywords: ['ufo', 'alien'] },
      { emoji: '\u{1F6A2}', name: 'ship', keywords: ['ship', 'boat'] },
      { emoji: '\u{26F5}', name: 'sailboat', keywords: ['sailboat', 'sail'] },
      { emoji: '\u{1F6A4}', name: 'speedboat', keywords: ['speedboat', 'boat'] },
      { emoji: '\u{1F6F6}', name: 'canoe', keywords: ['canoe', 'kayak'] },
      { emoji: '\u{1F682}', name: 'locomotive', keywords: ['train', 'railway'] },
      { emoji: '\u{1F683}', name: 'railway car', keywords: ['train', 'railway'] },
      { emoji: '\u{1F684}', name: 'high-speed train', keywords: ['train', 'bullet'] },
      { emoji: '\u{1F685}', name: 'bullet train', keywords: ['train', 'shinkansen'] },
      { emoji: '\u{1F687}', name: 'metro', keywords: ['subway', 'metro'] },
      { emoji: '\u{1F3E0}', name: 'house', keywords: ['home', 'building'] },
      { emoji: '\u{1F3E2}', name: 'office building', keywords: ['office', 'building'] },
      { emoji: '\u{1F3E5}', name: 'hospital', keywords: ['hospital', 'health'] },
      { emoji: '\u{1F3EB}', name: 'school', keywords: ['school', 'education'] },
      { emoji: '\u{1F3EA}', name: 'convenience store', keywords: ['store', 'shop'] },
      { emoji: '\u{1F3E8}', name: 'hotel', keywords: ['hotel', 'stay'] },
      { emoji: '\u{1F3E9}', name: 'love hotel', keywords: ['hotel', 'love'] },
      { emoji: '\u{1F3EC}', name: 'department store', keywords: ['store', 'mall'] },
      { emoji: '\u{1F3ED}', name: 'factory', keywords: ['factory', 'industrial'] },
      { emoji: '\u{1F3EF}', name: 'Japanese castle', keywords: ['castle', 'japan'] },
      { emoji: '\u{1F3F0}', name: 'castle', keywords: ['castle', 'medieval'] },
      { emoji: '\u{1F5FC}', name: 'Tokyo tower', keywords: ['tokyo', 'tower'] },
      { emoji: '\u{1F5FD}', name: 'Statue of Liberty', keywords: ['liberty', 'usa'] },
      { emoji: '\u{26EA}', name: 'church', keywords: ['church', 'religion'] },
      { emoji: '\u{1F54C}', name: 'mosque', keywords: ['mosque', 'islam'] },
      { emoji: '\u{1F54D}', name: 'synagogue', keywords: ['synagogue', 'jewish'] },
      { emoji: '\u{26E9}', name: 'shinto shrine', keywords: ['shrine', 'japan'] },
      { emoji: '\u{1F54B}', name: 'kaaba', keywords: ['mecca', 'islam'] },
      { emoji: '\u{26F2}', name: 'fountain', keywords: ['fountain', 'park'] },
      { emoji: '\u{26FA}', name: 'tent', keywords: ['camping', 'tent'] },
      { emoji: '\u{1F301}', name: 'foggy', keywords: ['fog', 'weather'] },
      { emoji: '\u{1F303}', name: 'night with stars', keywords: ['night', 'stars'] },
      { emoji: '\u{1F304}', name: 'sunrise over mountains', keywords: ['sunrise'] },
      { emoji: '\u{1F305}', name: 'sunrise', keywords: ['sunrise', 'morning'] },
      { emoji: '\u{1F306}', name: 'cityscape at dusk', keywords: ['city', 'dusk'] },
      { emoji: '\u{1F307}', name: 'sunset', keywords: ['sunset', 'evening'] },
      { emoji: '\u{1F309}', name: 'bridge at night', keywords: ['bridge', 'night'] },
      { emoji: '\u{1F30C}', name: 'milky way', keywords: ['galaxy', 'space'] },
      { emoji: '\u{1F3A0}', name: 'carousel horse', keywords: ['carousel', 'amusement'] },
      { emoji: '\u{1F3A1}', name: 'ferris wheel', keywords: ['ferris wheel', 'amusement'] },
      { emoji: '\u{1F3A2}', name: 'roller coaster', keywords: ['roller coaster', 'amusement'] },
      { emoji: '\u{1F488}', name: 'barber pole', keywords: ['barber', 'haircut'] },
      { emoji: '\u{1F3AA}', name: 'circus tent', keywords: ['circus', 'tent'] },
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: '\u{1F4BB}',
    emojis: [
      { emoji: '\u{231A}', name: 'watch', keywords: ['watch', 'time'] },
      { emoji: '\u{1F4F1}', name: 'mobile phone', keywords: ['phone', 'mobile'] },
      { emoji: '\u{1F4F2}', name: 'mobile phone with arrow', keywords: ['phone', 'calling'] },
      { emoji: '\u{1F4BB}', name: 'laptop', keywords: ['laptop', 'computer'] },
      { emoji: '\u{1F5A5}', name: 'desktop computer', keywords: ['computer', 'desktop'] },
      { emoji: '\u{1F5A8}', name: 'printer', keywords: ['printer'] },
      { emoji: '\u{2328}', name: 'keyboard', keywords: ['keyboard', 'typing'] },
      { emoji: '\u{1F5B1}', name: 'computer mouse', keywords: ['mouse', 'computer'] },
      { emoji: '\u{1F5B2}', name: 'trackball', keywords: ['trackball', 'computer'] },
      { emoji: '\u{1F4BD}', name: 'computer disk', keywords: ['disk', 'storage'] },
      { emoji: '\u{1F4BE}', name: 'floppy disk', keywords: ['floppy', 'save'] },
      { emoji: '\u{1F4BF}', name: 'optical disk', keywords: ['cd', 'dvd'] },
      { emoji: '\u{1F4C0}', name: 'dvd', keywords: ['dvd', 'movie'] },
      { emoji: '\u{1F3A5}', name: 'movie camera', keywords: ['camera', 'film'] },
      { emoji: '\u{1F3AC}', name: 'clapper board', keywords: ['movie', 'film'] },
      { emoji: '\u{1F4F7}', name: 'camera', keywords: ['camera', 'photo'] },
      { emoji: '\u{1F4F8}', name: 'camera with flash', keywords: ['camera', 'flash'] },
      { emoji: '\u{1F4F9}', name: 'video camera', keywords: ['video', 'camera'] },
      { emoji: '\u{1F4FA}', name: 'television', keywords: ['tv', 'television'] },
      { emoji: '\u{1F4FB}', name: 'radio', keywords: ['radio'] },
      { emoji: '\u{1F3A7}', name: 'headphone', keywords: ['headphones', 'music'] },
      { emoji: '\u{1F3A4}', name: 'microphone', keywords: ['microphone', 'singing'] },
      { emoji: '\u{1F399}', name: 'studio microphone', keywords: ['podcast', 'studio'] },
      { emoji: '\u{1F39A}', name: 'level slider', keywords: ['mixer', 'audio'] },
      { emoji: '\u{1F39B}', name: 'control knobs', keywords: ['mixer', 'audio'] },
      { emoji: '\u{1F50B}', name: 'battery', keywords: ['battery', 'power'] },
      { emoji: '\u{1FAAB}', name: 'low battery', keywords: ['battery', 'low'] },
      { emoji: '\u{1F50C}', name: 'electric plug', keywords: ['plug', 'power'] },
      { emoji: '\u{1F4A1}', name: 'light bulb', keywords: ['idea', 'light'] },
      { emoji: '\u{1F526}', name: 'flashlight', keywords: ['flashlight', 'torch'] },
      { emoji: '\u{1F56F}', name: 'candle', keywords: ['candle', 'light'] },
      { emoji: '\u{1FA94}', name: 'diya lamp', keywords: ['lamp', 'light'] },
      { emoji: '\u{1F4D5}', name: 'closed book', keywords: ['book', 'closed'] },
      { emoji: '\u{1F4D6}', name: 'open book', keywords: ['book', 'reading'] },
      { emoji: '\u{1F4D7}', name: 'green book', keywords: ['book'] },
      { emoji: '\u{1F4D8}', name: 'blue book', keywords: ['book'] },
      { emoji: '\u{1F4D9}', name: 'orange book', keywords: ['book'] },
      { emoji: '\u{1F4DA}', name: 'books', keywords: ['books', 'library'] },
      { emoji: '\u{1F4D3}', name: 'notebook', keywords: ['notebook'] },
      { emoji: '\u{1F4D2}', name: 'ledger', keywords: ['notebook', 'ledger'] },
      { emoji: '\u{1F4C3}', name: 'page with curl', keywords: ['document', 'page'] },
      { emoji: '\u{1F4DC}', name: 'scroll', keywords: ['scroll', 'document'] },
      { emoji: '\u{1F4C4}', name: 'page facing up', keywords: ['document', 'page'] },
      { emoji: '\u{1F4F0}', name: 'newspaper', keywords: ['newspaper', 'news'] },
      { emoji: '\u{1F5DE}', name: 'rolled-up newspaper', keywords: ['newspaper'] },
      { emoji: '\u{1F516}', name: 'bookmark', keywords: ['bookmark', 'save'] },
      { emoji: '\u{1F3F7}', name: 'label', keywords: ['tag', 'label'] },
      { emoji: '\u{1F4B0}', name: 'money bag', keywords: ['money', 'rich'] },
      { emoji: '\u{1FA99}', name: 'coin', keywords: ['coin', 'money'] },
      { emoji: '\u{1F4B5}', name: 'dollar banknote', keywords: ['money', 'dollar'] },
      { emoji: '\u{1F4B4}', name: 'yen banknote', keywords: ['money', 'yen'] },
      { emoji: '\u{1F4B6}', name: 'euro banknote', keywords: ['money', 'euro'] },
      { emoji: '\u{1F4B7}', name: 'pound banknote', keywords: ['money', 'pound'] },
      { emoji: '\u{1F4B3}', name: 'credit card', keywords: ['credit', 'card'] },
      { emoji: '\u{1F4E7}', name: 'e-mail', keywords: ['email', 'mail'] },
      { emoji: '\u{1F4E8}', name: 'incoming envelope', keywords: ['email', 'inbox'] },
      { emoji: '\u{1F4E9}', name: 'envelope with arrow', keywords: ['email', 'send'] },
      { emoji: '\u{1F4E4}', name: 'outbox tray', keywords: ['outbox', 'sent'] },
      { emoji: '\u{1F4E5}', name: 'inbox tray', keywords: ['inbox', 'receive'] },
      { emoji: '\u{1F4E6}', name: 'package', keywords: ['package', 'delivery'] },
      { emoji: '\u{1F4EB}', name: 'closed mailbox with raised flag', keywords: ['mailbox'] },
      { emoji: '\u{1F4EA}', name: 'closed mailbox with lowered flag', keywords: ['mailbox'] },
      { emoji: '\u{1F4EC}', name: 'open mailbox with raised flag', keywords: ['mailbox'] },
      { emoji: '\u{1F4ED}', name: 'open mailbox with lowered flag', keywords: ['mailbox'] },
      { emoji: '\u{1F4EE}', name: 'postbox', keywords: ['postbox', 'mail'] },
      { emoji: '\u{270F}', name: 'pencil', keywords: ['pencil', 'write'] },
      { emoji: '\u{2712}', name: 'black nib', keywords: ['pen', 'nib'] },
      { emoji: '\u{1F58B}', name: 'fountain pen', keywords: ['pen', 'fountain'] },
      { emoji: '\u{1F58A}', name: 'pen', keywords: ['pen', 'write'] },
      { emoji: '\u{1F58C}', name: 'paintbrush', keywords: ['brush', 'paint'] },
      { emoji: '\u{1F58D}', name: 'crayon', keywords: ['crayon', 'color'] },
      { emoji: '\u{1F4DD}', name: 'memo', keywords: ['memo', 'note'] },
      { emoji: '\u{1F4BC}', name: 'briefcase', keywords: ['briefcase', 'work'] },
      { emoji: '\u{1F4C1}', name: 'file folder', keywords: ['folder', 'file'] },
      { emoji: '\u{1F4C2}', name: 'open file folder', keywords: ['folder', 'open'] },
      { emoji: '\u{1F5C2}', name: 'card index dividers', keywords: ['index', 'dividers'] },
      { emoji: '\u{1F4C5}', name: 'calendar', keywords: ['calendar', 'date'] },
      { emoji: '\u{1F4C6}', name: 'tear-off calendar', keywords: ['calendar', 'date'] },
      { emoji: '\u{1F5D2}', name: 'spiral notepad', keywords: ['notepad', 'notes'] },
      { emoji: '\u{1F5D3}', name: 'spiral calendar', keywords: ['calendar', 'date'] },
      { emoji: '\u{1F4C7}', name: 'card index', keywords: ['rolodex', 'contacts'] },
      { emoji: '\u{1F4C8}', name: 'chart increasing', keywords: ['graph', 'chart', 'up'] },
      { emoji: '\u{1F4C9}', name: 'chart decreasing', keywords: ['graph', 'chart', 'down'] },
      { emoji: '\u{1F4CA}', name: 'bar chart', keywords: ['graph', 'chart'] },
      { emoji: '\u{1F4CB}', name: 'clipboard', keywords: ['clipboard', 'copy'] },
      { emoji: '\u{1F4CC}', name: 'pushpin', keywords: ['pin', 'pushpin'] },
      { emoji: '\u{1F4CD}', name: 'round pushpin', keywords: ['pin', 'location'] },
      { emoji: '\u{1F4CE}', name: 'paperclip', keywords: ['paperclip', 'attach'] },
      { emoji: '\u{1F587}', name: 'linked paperclips', keywords: ['paperclips', 'chain'] },
      { emoji: '\u{1F4CF}', name: 'straight ruler', keywords: ['ruler', 'measure'] },
      { emoji: '\u{1F4D0}', name: 'triangular ruler', keywords: ['ruler', 'triangle'] },
      { emoji: '\u{2702}', name: 'scissors', keywords: ['scissors', 'cut'] },
      { emoji: '\u{1F5C3}', name: 'card file box', keywords: ['file', 'box'] },
      { emoji: '\u{1F5C4}', name: 'file cabinet', keywords: ['filing', 'cabinet'] },
      { emoji: '\u{1F5D1}', name: 'wastebasket', keywords: ['trash', 'delete'] },
      { emoji: '\u{1F512}', name: 'locked', keywords: ['lock', 'secure'] },
      { emoji: '\u{1F513}', name: 'unlocked', keywords: ['unlock', 'open'] },
      { emoji: '\u{1F50F}', name: 'locked with pen', keywords: ['privacy', 'secure'] },
      { emoji: '\u{1F510}', name: 'locked with key', keywords: ['secure', 'privacy'] },
      { emoji: '\u{1F511}', name: 'key', keywords: ['key', 'unlock'] },
      { emoji: '\u{1F5DD}', name: 'old key', keywords: ['key', 'vintage'] },
      { emoji: '\u{1F528}', name: 'hammer', keywords: ['hammer', 'tool'] },
      { emoji: '\u{1FA93}', name: 'axe', keywords: ['axe', 'tool'] },
      { emoji: '\u{26CF}', name: 'pick', keywords: ['pick', 'mine'] },
      { emoji: '\u{2692}', name: 'hammer and pick', keywords: ['tools', 'mining'] },
      { emoji: '\u{1F6E0}', name: 'hammer and wrench', keywords: ['tools', 'settings'] },
      { emoji: '\u{1F5E1}', name: 'dagger', keywords: ['dagger', 'knife'] },
      { emoji: '\u{2694}', name: 'crossed swords', keywords: ['swords', 'fight'] },
      { emoji: '\u{1F4A3}', name: 'bomb', keywords: ['bomb', 'explosive'] },
      { emoji: '\u{1FA83}', name: 'boomerang', keywords: ['boomerang', 'return'] },
      { emoji: '\u{1F3F9}', name: 'bow and arrow', keywords: ['archery', 'bow'] },
      { emoji: '\u{1F6E1}', name: 'shield', keywords: ['shield', 'protect'] },
      { emoji: '\u{1FA9A}', name: 'carpentry saw', keywords: ['saw', 'tool'] },
      { emoji: '\u{1F527}', name: 'wrench', keywords: ['wrench', 'tool'] },
      { emoji: '\u{1FA9B}', name: 'screwdriver', keywords: ['screwdriver', 'tool'] },
      { emoji: '\u{1F529}', name: 'nut and bolt', keywords: ['hardware', 'nut'] },
      { emoji: '\u{2699}', name: 'gear', keywords: ['gear', 'settings'] },
      { emoji: '\u{1F5DC}', name: 'clamp', keywords: ['clamp', 'tool'] },
      { emoji: '\u{2696}', name: 'balance scale', keywords: ['scale', 'justice'] },
      { emoji: '\u{1F9AF}', name: 'white cane', keywords: ['cane', 'blind'] },
      { emoji: '\u{1F517}', name: 'link', keywords: ['link', 'chain'] },
      { emoji: '\u{26D3}', name: 'chains', keywords: ['chains', 'link'] },
      { emoji: '\u{1FA9D}', name: 'hook', keywords: ['hook', 'pirate'] },
      { emoji: '\u{1F9F0}', name: 'toolbox', keywords: ['tools', 'box'] },
      { emoji: '\u{1F9F2}', name: 'magnet', keywords: ['magnet', 'attract'] },
      { emoji: '\u{1FA9C}', name: 'ladder', keywords: ['ladder', 'climb'] },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: '\u{2764}',
    emojis: [
      { emoji: '\u{2705}', name: 'check mark button', keywords: ['check', 'yes', 'done'] },
      { emoji: '\u{274C}', name: 'cross mark', keywords: ['x', 'no', 'wrong'] },
      { emoji: '\u{274E}', name: 'cross mark button', keywords: ['x', 'no'] },
      { emoji: '\u{2795}', name: 'plus', keywords: ['plus', 'add'] },
      { emoji: '\u{2796}', name: 'minus', keywords: ['minus', 'subtract'] },
      { emoji: '\u{2797}', name: 'division', keywords: ['divide', 'math'] },
      { emoji: '\u{27B0}', name: 'curly loop', keywords: ['loop', 'curl'] },
      { emoji: '\u{27BF}', name: 'double curly loop', keywords: ['loop'] },
      { emoji: '\u{2757}', name: 'exclamation mark', keywords: ['exclamation', '!'] },
      { emoji: '\u{2753}', name: 'question mark', keywords: ['question', '?'] },
      { emoji: '\u{2754}', name: 'white question mark', keywords: ['question'] },
      { emoji: '\u{2755}', name: 'white exclamation mark', keywords: ['exclamation'] },
      { emoji: '\u{203C}', name: 'double exclamation mark', keywords: ['!!', 'exclamation'] },
      { emoji: '\u{2049}', name: 'exclamation question mark', keywords: ['!?', 'interrobang'] },
      { emoji: '\u{1F4AF}', name: 'hundred points', keywords: ['100', 'perfect'] },
      { emoji: '\u{1F4A2}', name: 'anger symbol', keywords: ['anger', 'mad'] },
      { emoji: '\u{1F4A5}', name: 'collision', keywords: ['explosion', 'boom'] },
      { emoji: '\u{1F4AB}', name: 'dizzy', keywords: ['dizzy', 'star'] },
      { emoji: '\u{1F4AC}', name: 'speech balloon', keywords: ['speech', 'chat'] },
      { emoji: '\u{1F4AD}', name: 'thought balloon', keywords: ['thought', 'thinking'] },
      { emoji: '\u{1F5EF}', name: 'right anger bubble', keywords: ['anger', 'mad'] },
      { emoji: '\u{1F4A4}', name: 'zzz', keywords: ['sleep', 'zzz'] },
      { emoji: '\u{1F5E8}', name: 'left speech bubble', keywords: ['speech'] },
      { emoji: '\u{2660}', name: 'spade suit', keywords: ['spade', 'cards'] },
      { emoji: '\u{2663}', name: 'club suit', keywords: ['club', 'cards'] },
      { emoji: '\u{2665}', name: 'heart suit', keywords: ['heart', 'cards'] },
      { emoji: '\u{2666}', name: 'diamond suit', keywords: ['diamond', 'cards'] },
      { emoji: '\u{1F6AB}', name: 'prohibited', keywords: ['no', 'forbidden'] },
      { emoji: '\u{1F4F4}', name: 'mobile phone off', keywords: ['phone', 'off'] },
      { emoji: '\u{1F4F3}', name: 'vibration mode', keywords: ['phone', 'vibrate'] },
      { emoji: '\u{1F51E}', name: 'no one under eighteen', keywords: ['18+', 'adult'] },
      { emoji: '\u{267B}', name: 'recycling symbol', keywords: ['recycle', 'green'] },
      { emoji: '\u{2B06}', name: 'up arrow', keywords: ['up', 'arrow'] },
      { emoji: '\u{2B07}', name: 'down arrow', keywords: ['down', 'arrow'] },
      { emoji: '\u{27A1}', name: 'right arrow', keywords: ['right', 'arrow'] },
      { emoji: '\u{2B05}', name: 'left arrow', keywords: ['left', 'arrow'] },
      { emoji: '\u{2197}', name: 'up-right arrow', keywords: ['arrow', 'diagonal'] },
      { emoji: '\u{2198}', name: 'down-right arrow', keywords: ['arrow', 'diagonal'] },
      { emoji: '\u{2199}', name: 'down-left arrow', keywords: ['arrow', 'diagonal'] },
      { emoji: '\u{2196}', name: 'up-left arrow', keywords: ['arrow', 'diagonal'] },
      { emoji: '\u{2195}', name: 'up-down arrow', keywords: ['arrow', 'vertical'] },
      { emoji: '\u{2194}', name: 'left-right arrow', keywords: ['arrow', 'horizontal'] },
      { emoji: '\u{21A9}', name: 'right arrow curving left', keywords: ['reply', 'arrow'] },
      { emoji: '\u{21AA}', name: 'left arrow curving right', keywords: ['forward', 'arrow'] },
      { emoji: '\u{1F504}', name: 'counterclockwise arrows button', keywords: ['refresh', 'reload'] },
      { emoji: '\u{1F503}', name: 'clockwise vertical arrows', keywords: ['sync', 'rotate'] },
      { emoji: '\u{1F519}', name: 'BACK arrow', keywords: ['back', 'arrow'] },
      { emoji: '\u{1F51A}', name: 'END arrow', keywords: ['end', 'arrow'] },
      { emoji: '\u{1F51B}', name: 'ON! arrow', keywords: ['on', 'arrow'] },
      { emoji: '\u{1F51C}', name: 'SOON arrow', keywords: ['soon', 'arrow'] },
      { emoji: '\u{1F51D}', name: 'TOP arrow', keywords: ['top', 'arrow'] },
      { emoji: '\u{26A0}', name: 'warning', keywords: ['warning', 'caution'] },
      { emoji: '\u{267F}', name: 'wheelchair symbol', keywords: ['accessible', 'disability'] },
      { emoji: '\u{26D4}', name: 'no entry', keywords: ['stop', 'forbidden'] },
      { emoji: '\u{1F6B7}', name: 'no pedestrians', keywords: ['no walking'] },
      { emoji: '\u{1F6AF}', name: 'no littering', keywords: ['no trash'] },
      { emoji: '\u{1F6B3}', name: 'no bicycles', keywords: ['no bikes'] },
      { emoji: '\u{1F6B1}', name: 'non-potable water', keywords: ['no drinking'] },
      { emoji: '\u{1F6AD}', name: 'no smoking', keywords: ['no smoking'] },
      { emoji: '\u{2714}', name: 'check mark', keywords: ['check', 'yes'] },
      { emoji: '\u{2716}', name: 'cross mark', keywords: ['x', 'no'] },
      { emoji: '\u{2122}', name: 'trade mark', keywords: ['trademark', 'tm'] },
      { emoji: '\u{00A9}', name: 'copyright', keywords: ['copyright', 'c'] },
      { emoji: '\u{00AE}', name: 'registered', keywords: ['registered', 'r'] },
      { emoji: '\u{3030}', name: 'wavy dash', keywords: ['wave', 'dash'] },
      { emoji: '\u{303D}', name: 'part alternation mark', keywords: ['mark'] },
      { emoji: '\u{1F530}', name: 'Japanese symbol for beginner', keywords: ['beginner', 'japan'] },
      { emoji: '\u{1F531}', name: 'trident emblem', keywords: ['trident', 'emblem'] },
      { emoji: '\u{269C}', name: 'fleur-de-lis', keywords: ['fleur', 'france'] },
      { emoji: '\u{2733}', name: 'eight-spoked asterisk', keywords: ['asterisk', 'star'] },
      { emoji: '\u{2734}', name: 'eight-pointed star', keywords: ['star'] },
      { emoji: '\u{2747}', name: 'sparkle', keywords: ['sparkle', 'star'] },
      { emoji: '\u{00B9}', name: 'superscript one', keywords: ['one', '1'] },
      { emoji: '\u{00B2}', name: 'superscript two', keywords: ['two', '2'] },
      { emoji: '\u{00B3}', name: 'superscript three', keywords: ['three', '3'] },
      { emoji: '\u{0030}\u{FE0F}\u{20E3}', name: 'keycap: 0', keywords: ['zero', '0'] },
      { emoji: '\u{0031}\u{FE0F}\u{20E3}', name: 'keycap: 1', keywords: ['one', '1'] },
      { emoji: '\u{0032}\u{FE0F}\u{20E3}', name: 'keycap: 2', keywords: ['two', '2'] },
      { emoji: '\u{0033}\u{FE0F}\u{20E3}', name: 'keycap: 3', keywords: ['three', '3'] },
      { emoji: '\u{0034}\u{FE0F}\u{20E3}', name: 'keycap: 4', keywords: ['four', '4'] },
      { emoji: '\u{0035}\u{FE0F}\u{20E3}', name: 'keycap: 5', keywords: ['five', '5'] },
      { emoji: '\u{0036}\u{FE0F}\u{20E3}', name: 'keycap: 6', keywords: ['six', '6'] },
      { emoji: '\u{0037}\u{FE0F}\u{20E3}', name: 'keycap: 7', keywords: ['seven', '7'] },
      { emoji: '\u{0038}\u{FE0F}\u{20E3}', name: 'keycap: 8', keywords: ['eight', '8'] },
      { emoji: '\u{0039}\u{FE0F}\u{20E3}', name: 'keycap: 9', keywords: ['nine', '9'] },
      { emoji: '\u{1F51F}', name: 'keycap: 10', keywords: ['ten', '10'] },
      { emoji: '\u{1F520}', name: 'input latin uppercase', keywords: ['uppercase', 'abc'] },
      { emoji: '\u{1F521}', name: 'input latin lowercase', keywords: ['lowercase', 'abc'] },
      { emoji: '\u{1F522}', name: 'input numbers', keywords: ['numbers', '123'] },
      { emoji: '\u{1F523}', name: 'input symbols', keywords: ['symbols'] },
      { emoji: '\u{1F524}', name: 'input latin letters', keywords: ['letters', 'abc'] },
      { emoji: '\u{1F170}', name: 'A button', keywords: ['a', 'blood'] },
      { emoji: '\u{1F18E}', name: 'AB button', keywords: ['ab', 'blood'] },
      { emoji: '\u{1F171}', name: 'B button', keywords: ['b', 'blood'] },
      { emoji: '\u{1F191}', name: 'CL button', keywords: ['cl', 'clear'] },
      { emoji: '\u{1F192}', name: 'COOL button', keywords: ['cool'] },
      { emoji: '\u{1F193}', name: 'FREE button', keywords: ['free'] },
      { emoji: '\u{2139}', name: 'information', keywords: ['info', 'i'] },
      { emoji: '\u{1F194}', name: 'ID button', keywords: ['id'] },
      { emoji: '\u{24C2}', name: 'circled M', keywords: ['metro', 'm'] },
      { emoji: '\u{1F195}', name: 'NEW button', keywords: ['new'] },
      { emoji: '\u{1F196}', name: 'NG button', keywords: ['ng', 'no good'] },
      { emoji: '\u{1F17E}', name: 'O button', keywords: ['o', 'blood'] },
      { emoji: '\u{1F197}', name: 'OK button', keywords: ['ok'] },
      { emoji: '\u{1F17F}', name: 'P button', keywords: ['parking', 'p'] },
      { emoji: '\u{1F198}', name: 'SOS button', keywords: ['sos', 'help'] },
      { emoji: '\u{1F199}', name: 'UP! button', keywords: ['up'] },
      { emoji: '\u{1F19A}', name: 'VS button', keywords: ['vs', 'versus'] },
    ],
  },
  {
    id: 'flags',
    name: 'Flags',
    icon: '\u{1F3C1}',
    emojis: [
      { emoji: '\u{1F3C1}', name: 'chequered flag', keywords: ['race', 'finish'] },
      { emoji: '\u{1F6A9}', name: 'triangular flag', keywords: ['flag', 'golf'] },
      { emoji: '\u{1F38C}', name: 'crossed flags', keywords: ['japan', 'flags'] },
      { emoji: '\u{1F3F4}', name: 'black flag', keywords: ['flag', 'black'] },
      { emoji: '\u{1F3F3}', name: 'white flag', keywords: ['surrender', 'peace'] },
      { emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', name: 'rainbow flag', keywords: ['pride', 'lgbtq'] },
      { emoji: '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}\u{FE0F}', name: 'transgender flag', keywords: ['trans', 'pride'] },
      { emoji: '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}', name: 'pirate flag', keywords: ['pirate', 'skull'] },
      { emoji: '\u{1F1FA}\u{1F1F8}', name: 'flag: United States', keywords: ['usa', 'america'] },
      { emoji: '\u{1F1EC}\u{1F1E7}', name: 'flag: United Kingdom', keywords: ['uk', 'britain'] },
      { emoji: '\u{1F1E8}\u{1F1E6}', name: 'flag: Canada', keywords: ['canada'] },
      { emoji: '\u{1F1E6}\u{1F1FA}', name: 'flag: Australia', keywords: ['australia'] },
      { emoji: '\u{1F1EF}\u{1F1F5}', name: 'flag: Japan', keywords: ['japan'] },
      { emoji: '\u{1F1E8}\u{1F1F3}', name: 'flag: China', keywords: ['china'] },
      { emoji: '\u{1F1F0}\u{1F1F7}', name: 'flag: South Korea', keywords: ['korea', 'south korea'] },
      { emoji: '\u{1F1E9}\u{1F1EA}', name: 'flag: Germany', keywords: ['germany'] },
      { emoji: '\u{1F1EB}\u{1F1F7}', name: 'flag: France', keywords: ['france'] },
      { emoji: '\u{1F1EE}\u{1F1F9}', name: 'flag: Italy', keywords: ['italy'] },
      { emoji: '\u{1F1EA}\u{1F1F8}', name: 'flag: Spain', keywords: ['spain'] },
      { emoji: '\u{1F1F7}\u{1F1FA}', name: 'flag: Russia', keywords: ['russia'] },
      { emoji: '\u{1F1E7}\u{1F1F7}', name: 'flag: Brazil', keywords: ['brazil'] },
      { emoji: '\u{1F1F2}\u{1F1FD}', name: 'flag: Mexico', keywords: ['mexico'] },
      { emoji: '\u{1F1EE}\u{1F1F3}', name: 'flag: India', keywords: ['india'] },
      { emoji: '\u{1F1F3}\u{1F1EC}', name: 'flag: Nigeria', keywords: ['nigeria'] },
      { emoji: '\u{1F1FF}\u{1F1E6}', name: 'flag: South Africa', keywords: ['south africa'] },
      { emoji: '\u{1F1EA}\u{1F1EC}', name: 'flag: Egypt', keywords: ['egypt'] },
      { emoji: '\u{1F1F8}\u{1F1E6}', name: 'flag: Saudi Arabia', keywords: ['saudi'] },
      { emoji: '\u{1F1E6}\u{1F1EA}', name: 'flag: United Arab Emirates', keywords: ['uae', 'dubai'] },
      { emoji: '\u{1F1F9}\u{1F1F7}', name: 'flag: Turkey', keywords: ['turkey'] },
      { emoji: '\u{1F1EE}\u{1F1E9}', name: 'flag: Indonesia', keywords: ['indonesia'] },
      { emoji: '\u{1F1F5}\u{1F1ED}', name: 'flag: Philippines', keywords: ['philippines'] },
      { emoji: '\u{1F1F9}\u{1F1ED}', name: 'flag: Thailand', keywords: ['thailand'] },
      { emoji: '\u{1F1FB}\u{1F1F3}', name: 'flag: Vietnam', keywords: ['vietnam'] },
      { emoji: '\u{1F1F8}\u{1F1EC}', name: 'flag: Singapore', keywords: ['singapore'] },
      { emoji: '\u{1F1F2}\u{1F1FE}', name: 'flag: Malaysia', keywords: ['malaysia'] },
      { emoji: '\u{1F1F5}\u{1F1F1}', name: 'flag: Poland', keywords: ['poland'] },
      { emoji: '\u{1F1F3}\u{1F1F1}', name: 'flag: Netherlands', keywords: ['netherlands', 'dutch'] },
      { emoji: '\u{1F1E7}\u{1F1EA}', name: 'flag: Belgium', keywords: ['belgium'] },
      { emoji: '\u{1F1E8}\u{1F1ED}', name: 'flag: Switzerland', keywords: ['switzerland'] },
      { emoji: '\u{1F1E6}\u{1F1F9}', name: 'flag: Austria', keywords: ['austria'] },
      { emoji: '\u{1F1F8}\u{1F1EA}', name: 'flag: Sweden', keywords: ['sweden'] },
      { emoji: '\u{1F1F3}\u{1F1F4}', name: 'flag: Norway', keywords: ['norway'] },
      { emoji: '\u{1F1E9}\u{1F1F0}', name: 'flag: Denmark', keywords: ['denmark'] },
      { emoji: '\u{1F1EB}\u{1F1EE}', name: 'flag: Finland', keywords: ['finland'] },
      { emoji: '\u{1F1EE}\u{1F1EA}', name: 'flag: Ireland', keywords: ['ireland'] },
      { emoji: '\u{1F1F5}\u{1F1F9}', name: 'flag: Portugal', keywords: ['portugal'] },
      { emoji: '\u{1F1EC}\u{1F1F7}', name: 'flag: Greece', keywords: ['greece'] },
      { emoji: '\u{1F1EE}\u{1F1F1}', name: 'flag: Israel', keywords: ['israel'] },
      { emoji: '\u{1F1E6}\u{1F1F7}', name: 'flag: Argentina', keywords: ['argentina'] },
      { emoji: '\u{1F1E8}\u{1F1F1}', name: 'flag: Chile', keywords: ['chile'] },
      { emoji: '\u{1F1E8}\u{1F1F4}', name: 'flag: Colombia', keywords: ['colombia'] },
      { emoji: '\u{1F1F5}\u{1F1EA}', name: 'flag: Peru', keywords: ['peru'] },
      { emoji: '\u{1F1FB}\u{1F1EA}', name: 'flag: Venezuela', keywords: ['venezuela'] },
      { emoji: '\u{1F1F3}\u{1F1FF}', name: 'flag: New Zealand', keywords: ['new zealand'] },
    ],
  },
];

// Storage key for recent emojis
const RECENT_EMOJIS_KEY = 'dex-recent-emojis';
const MAX_RECENT = 32;

// ---------------------------------------------------------------------------
// EmojiPicker Component
// ---------------------------------------------------------------------------
export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  style,
}) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [skinTone, setSkinTone] = useState<typeof skinTones[number]>(skinTones[0]);
  const [showSkinTones, setShowSkinTones] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<EmojiData[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Load recent emojis on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
      if (stored) {
        setRecentEmojis(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  // Apply skin tone to emoji if supported
  const applySkinTone = useCallback((emoji: string): string => {
    if (skinTone.modifier && skinToneSupported.has(emoji)) {
      return emoji + skinTone.modifier;
    }
    return emoji;
  }, [skinTone]);

  // Handle emoji selection
  const handleSelect = useCallback((emojiData: EmojiData) => {
    const emoji = applySkinTone(emojiData.emoji);
    onSelect(emoji);
    
    // Update recent emojis
    const newRecent = [emojiData, ...recentEmojis.filter(e => e.emoji !== emojiData.emoji)].slice(0, MAX_RECENT);
    setRecentEmojis(newRecent);
    try {
      localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(newRecent));
    } catch { /* ignore */ }
  }, [applySkinTone, onSelect, recentEmojis]);

  // Filter emojis by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) {
      // Include recent emojis in the first category
      const categoriesWithRecent = [...emojiCategories];
      categoriesWithRecent[0] = { ...categoriesWithRecent[0], emojis: recentEmojis };
      return categoriesWithRecent;
    }
    
    const query = search.toLowerCase();
    const allEmojis: EmojiData[] = [];
    
    for (const cat of emojiCategories) {
      if (cat.id === 'recent') continue;
      for (const emoji of cat.emojis) {
        if (
          emoji.name.toLowerCase().includes(query) ||
          emoji.keywords?.some(k => k.toLowerCase().includes(query))
        ) {
          allEmojis.push(emoji);
        }
      }
    }
    
    return [{
      id: 'search',
      name: 'Search Results',
      icon: '\u{1F50D}',
      emojis: allEmojis,
    }];
  }, [search, recentEmojis]);

  // Scroll to category
  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
    setSearch('');
    const element = document.getElementById(`emoji-category-${categoryId}`);
    if (element && gridRef.current) {
      gridRef.current.scrollTop = element.offsetTop - gridRef.current.offsetTop;
    }
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const containerStyle: React.CSSProperties = {
    width: 'min(352px, calc(100vw - 48px))',
    maxHeight: 420,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: radius.xl,
    boxShadow: 'var(--shadow-xl)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...style,
  };

  const headerStyle: React.CSSProperties = {
    padding: space[3],
    borderBottom: '1px solid var(--color-border-subtle)',
  };

  const categoryTabsStyle: React.CSSProperties = {
    display: 'flex',
    padding: `${space[1]}px ${space[2]}px`,
    gap: space[1],
    borderBottom: '1px solid var(--color-border-subtle)',
    overflowX: 'auto',
  };

  const gridContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: space[2],
  };

  const emojiGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: space[1],
  };

  const emojiButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: radius.sm,
    cursor: 'pointer',
    fontSize: 22,
    transition: `background ${transition.fast}`,
  };

  const categoryLabelStyle: React.CSSProperties = {
    padding: `${space[2]}px ${space[1]}px`,
  };

  const skinToneButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: radius.full,
    cursor: 'pointer',
    fontSize: 16,
  };

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Header with search and skin tone */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <DexSearchInput
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            fullWidth
            autoFocus
          />
          <div style={{ position: 'relative' }}>
            <button
              style={skinToneButtonStyle}
              onClick={() => setShowSkinTones(!showSkinTones)}
              title="Skin tone"
            >
              {skinTone.modifier ? `\u{270B}${skinTone.modifier}` : '\u{270B}'}
            </button>
            {showSkinTones && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                padding: space[1],
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: radius.md,
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                gap: space[1],
                zIndex: 10,
              }}>
                {skinTones.map((tone) => (
                  <button
                    key={tone.id}
                    style={{
                      ...skinToneButtonStyle,
                      background: skinTone.id === tone.id ? 'var(--color-accent-soft)' : 'transparent',
                      border: skinTone.id === tone.id ? '1px solid var(--color-accent)' : '1px solid transparent',
                    }}
                    onClick={() => {
                      setSkinTone(tone);
                      setShowSkinTones(false);
                    }}
                    title={tone.name}
                  >
                    {tone.modifier ? `\u{270B}${tone.modifier}` : '\u{270B}'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div style={categoryTabsStyle}>
          {emojiCategories.map((cat) => (
            <button
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                padding: 0,
                background: activeCategory === cat.id ? 'var(--color-bg-hover)' : 'transparent',
                border: 'none',
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: 18,
                opacity: activeCategory === cat.id ? 1 : 0.6,
                transition: `all ${transition.fast}`,
              }}
              onClick={() => scrollToCategory(cat.id)}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div ref={gridRef} style={gridContainerStyle}>
        {filteredCategories.map((cat) => (
          <div key={cat.id} id={`emoji-category-${cat.id}`}>
            <div className="dex-label-caps" style={categoryLabelStyle}>{cat.name}</div>
            {cat.emojis.length > 0 ? (
              <div style={emojiGridStyle}>
                {cat.emojis.map((emoji, i) => (
                  <button
                    key={`${emoji.emoji}-${i}`}
                    style={emojiButtonStyle}
                    onClick={() => handleSelect(emoji)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    title={emoji.name}
                  >
                    {applySkinTone(emoji.emoji)}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: space[4], textAlign: 'center', color: 'var(--color-text-muted)', fontSize: fontSize.sm }}>
                {cat.id === 'recent' ? 'No recent emojis' : 'No emojis found'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;
