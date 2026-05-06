// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Response Generator
// Template-based response generation with personality-aware variation
// ===========================================================================

const casual = {
  greetings: [
    'Hey. What do you need?',
    'Listening.',
    'Go ahead.',
    'Ready.',
    'What can I do for you?',
  ],
  thanks: [
    'Anytime.',
    'You got it.',
    'Of course.',
    'No problem.',
  ],
  farewell: [
    'Standing by.',
    'I\'ll be here.',
    'Later.',
  ],
  howAreYou: [
    'All systems nominal.',
    'Running clean. What do you need?',
    'Operational. Go ahead.',
  ],
  identity: [
    'I\'m UKI -- your DEX assistant. I handle navigation, apps, files, media, automation, and more. Just ask.',
    'UKI. Built into DEX. I control your apps, manage files, play media, run workflows, and answer questions.',
  ],
  unknown: [
    'Didn\'t catch that. Try "help" for a command list.',
    'Not sure what you mean. Rephrase or say "help".',
    'I don\'t have a handler for that. Try something else.',
  ],
  success: [
    'Done.',
    'On it.',
    'Handled.',
    'Set.',
  ],
  error: [
    'That failed.',
    'Something went wrong.',
    'Couldn\'t do that.',
  ],
  jokes: [
    'Why do programmers prefer dark mode? Because light attracts bugs.',
    'There are only 10 types of people -- those who understand binary and those who don\'t.',
    'A SQL query walks into a bar, sees two tables, and asks: Can I join you?',
    'Why was the JavaScript developer sad? He didn\'t Node how to Express himself.',
    'What\'s a computer\'s favorite snack? Microchips.',
  ],
  help: [
    'Here is what I can do:\n\nNavigation: "go to files", "open settings", "go home"\nApps: "launch Imosion", "open VINX", "start Flux", "close calculator"\nMedia: "play", "pause", "next track", "volume up", "set volume to 50"\nFiles: "find documents", "create folder named Projects", "search for photos"\nCreative: "new project in Imosion", "apply reverb effect", "export as MP4", "undo", "redo", "save"\nTasks / Notes: "create a task", "new note called Meeting", "how many tasks are due"\nSystem: "screenshot", "battery status", "lock screen", "minimize"\nAutomation: "run workflow backup"\nSearch: "search the web for...", "what is...", "define..."\nChat: "what time is it", "what is the date", "tell me a joke", "calculate 42 * 8"\n\nJust speak naturally.',
  ],
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getResponse(type: keyof typeof casual): string {
  return pick(casual[type]);
}

export function successResponse(detail?: string): string {
  return detail ? `${pick(casual.success)} ${detail}` : pick(casual.success);
}

export function errorResponse(detail?: string): string {
  return detail ? `${pick(casual.error)} ${detail}` : pick(casual.error);
}
