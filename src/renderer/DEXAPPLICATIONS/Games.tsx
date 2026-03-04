/**
 * DEX Platform - Games Hub
 * Copyright (c) 2026 DEX. All rights reserved.
 * Mind games, puzzles, and brain-training challenges
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  PartyIcon, TrophyIcon, FrownIcon, BoltIcon, WarningIcon, CheckCircleIcon,
  FlagIcon, BombIcon, LightbulbIcon, TargetIcon, GamepadIcon, CircleIcon
} from '../utils/icons';

// ═══════════════════════════════════════════════════════════════════════════
// DEX GAMES HUB — Built-in Games & Brain Training
// Features: Typing Speed, Memory Match, Wordle, Minesweeper, Sudoku
// ═══════════════════════════════════════════════════════════════════════════

type GameId = 'lobby' | 'typing' | 'memory' | 'wordle' | 'minesweeper' | 'sudoku' | 'reaction';

interface GameStats {
  gamesPlayed: number;
  totalTime: number;
  bestScores: Record<string, number>;
}

// ═══ Persistence ═════════════════════════════════════════════════════════

const STATS_KEY = 'dex-games-stats';

function loadStats(): GameStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : { gamesPlayed: 0, totalTime: 0, bestScores: {} };
  } catch { return { gamesPlayed: 0, totalTime: 0, bestScores: {} }; }
}

function saveStats(stats: GameStats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
}

// ═══ Icons ════════════════════════════════════════════════════════════════

const GI = {
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  trophy: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  keyboard: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="8" y1="12" x2="8" y2="12"/><line x1="12" y1="12" x2="12" y2="12"/><line x1="16" y1="12" x2="16" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>,
  grid: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  text: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
  bomb: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="13" r="9"/><path d="M14.35 4.65l2.3-2.3"/><path d="M16.65 6.35l-2.3 2.3"/></svg>,
  puzzle: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
  zap: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  star: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

// ═══ GAME: Typing Speed Test ════════════════════════════════════════════

const TYPING_TEXTS = [
  'The quick brown fox jumps over the lazy dog near the riverbank.',
  'Programming is the art of telling another human what one wants the computer to do.',
  'Design is not just what it looks like and feels like. Design is how it works.',
  'Any sufficiently advanced technology is indistinguishable from magic.',
  'The best way to predict the future is to invent it today.',
  'Simplicity is the ultimate sophistication in design and engineering.',
  'Every great developer you know got there by solving problems they were unqualified to solve.',
  'The only way to do great work is to love what you do every single day.',
];

const TypingGame: React.FC<{ onBack: () => void; onScore: (game: string, score: number) => void }> = ({ onBack, onScore }) => {
  const [text, setText] = useState(() => TYPING_TEXTS[Math.floor(Math.random() * TYPING_TEXTS.length)]);
  const [input, setInput] = useState('');
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const resetGame = useCallback(() => {
    setText(TYPING_TEXTS[Math.floor(Math.random() * TYPING_TEXTS.length)]);
    setInput('');
    setStarted(false);
    setStartTime(0);
    setWpm(0);
    setAccuracy(100);
    setFinished(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleInput = useCallback((val: string) => {
    if (finished) return;
    if (!started) {
      setStarted(true);
      setStartTime(Date.now());
    }
    setInput(val);

    // Calculate accuracy
    let correct = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === text[i]) correct++;
    }
    setAccuracy(val.length > 0 ? Math.round((correct / val.length) * 100) : 100);

    // Calculate WPM
    const elapsed = (Date.now() - (startTime || Date.now())) / 1000 / 60;
    const words = val.split(/\s+/).filter(Boolean).length;
    if (elapsed > 0) setWpm(Math.round(words / elapsed));

    // Check completion
    if (val.length >= text.length) {
      setFinished(true);
      const finalWpm = Math.round(words / elapsed);
      onScore('typing', finalWpm);
    }
  }, [text, started, startTime, finished, onScore]);

  return (
    <div style={GS.gameContainer}>
      <div style={GS.gameHeader}>
        <button style={GS.backBtn} onClick={onBack} aria-label="Back to game list">{GI.back} Back</button>
        <h2 style={GS.gameTitle}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{GI.keyboard}</span>Typing Speed Test</h2>
      </div>

      <div style={GS.typingTarget}>
        {text.split('').map((char, i) => {
          let color = 'rgba(255,255,255,0.3)';
          if (i < input.length) {
            color = input[i] === char ? '#30d158' : '#ff453a';
          } else if (i === input.length) {
            color = '#ffd60a';
          }
          return <span key={i} style={{ color, fontWeight: i === input.length ? 700 : 400 }}>{char}</span>;
        })}
      </div>

      <input
        ref={inputRef}
        style={GS.typingInput}
        value={input}
        onChange={e => handleInput(e.target.value)}
        disabled={finished}
        placeholder={finished ? '' : 'Start typing...'}
        autoComplete="off"
        spellCheck={false}
      />

      <div style={GS.statsRow}>
        <div style={GS.statBox}>
          <div style={GS.statValue}>{wpm}</div>
          <div style={GS.statLabel}>WPM</div>
        </div>
        <div style={GS.statBox}>
          <div style={{ ...GS.statValue, color: accuracy >= 95 ? '#30d158' : accuracy >= 80 ? '#ffd60a' : '#ff453a' }}>
            {accuracy}%
          </div>
          <div style={GS.statLabel}>Accuracy</div>
        </div>
        <div style={GS.statBox}>
          <div style={GS.statValue}>{input.length}/{text.length}</div>
          <div style={GS.statLabel}>Progress</div>
        </div>
      </div>

      {finished && (
        <div style={GS.finishBanner}>
          <div style={{ fontSize: 28 }}><PartyIcon size={28} color="#ffd60a" /></div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Complete!</div>
          <div style={{ opacity: 0.6 }}>{wpm} WPM at {accuracy}% accuracy</div>
          <button style={GS.playAgainBtn} onClick={resetGame} aria-label="Play again">Play Again</button>
        </div>
      )}
    </div>
  );
};

// ═══ GAME: Memory Match ═════════════════════════════════════════════════

const MEMORY_SYMBOLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const MemoryGame: React.FC<{ onBack: () => void; onScore: (game: string, score: number) => void }> = ({ onBack, onScore }) => {
  const [cards, setCards] = useState<{ id: number; symbol: string; flipped: boolean; matched: boolean }[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [startTime] = useState(Date.now());
  const locked = useRef(false);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (flipTimerRef.current) clearTimeout(flipTimerRef.current); };
  }, []);

  useEffect(() => {
    const symbols = [...MEMORY_SYMBOLS, ...MEMORY_SYMBOLS];
    const shuffled = symbols.sort(() => Math.random() - 0.5);
    setCards(shuffled.map((symbol, i) => ({ id: i, symbol, flipped: false, matched: false })));
  }, []);

  const handleFlip = useCallback((id: number) => {
    if (locked.current) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched) return;

    const newFlipped = [...flipped, id];
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      locked.current = true;
      setMoves(m => m + 1);
      const [first, second] = newFlipped;
      const c1 = cards.find(c => c.id === first)!;
      const c2 = cards.find(c => c.id === second)!;

      if (c1.symbol === c2.symbol) {
        setCards(prev => prev.map(c => c.id === first || c.id === second ? { ...c, matched: true } : c));
        setMatches(m => {
          const newMatches = m + 1;
          if (newMatches === MEMORY_SYMBOLS.length) {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            onScore('memory', Math.max(100 - elapsed - moves * 2, 10));
          }
          return newMatches;
        });
        setFlipped([]);
        locked.current = false;
      } else {
        flipTimerRef.current = setTimeout(() => {
          setCards(prev => prev.map(c => c.id === first || c.id === second ? { ...c, flipped: false } : c));
          setFlipped([]);
          locked.current = false;
        }, 800);
      }
    }
  }, [cards, flipped, moves, startTime, onScore]);

  const done = matches === MEMORY_SYMBOLS.length;

  return (
    <div style={GS.gameContainer}>
      <div style={GS.gameHeader}>
        <button style={GS.backBtn} onClick={onBack} aria-label="Back to game list">{GI.back} Back</button>
        <h2 style={GS.gameTitle}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{GI.grid}</span>Memory Match</h2>
      </div>

      <div style={GS.statsRow}>
        <div style={GS.statBox}>
          <div style={GS.statValue}>{moves}</div>
          <div style={GS.statLabel}>Moves</div>
        </div>
        <div style={GS.statBox}>
          <div style={GS.statValue}>{matches}/{MEMORY_SYMBOLS.length}</div>
          <div style={GS.statLabel}>Matched</div>
        </div>
      </div>

      <div style={GS.memoryGrid}>
        {cards.map(card => (
          <div
            key={card.id}
            style={{
              ...GS.memoryCard,
              ...(card.flipped || card.matched ? GS.memoryCardFlipped : {}),
              ...(card.matched ? { opacity: 0.5 } : {}),
            }}
            onClick={() => handleFlip(card.id)}
          >
            {card.flipped || card.matched ? card.symbol : '?'}
          </div>
        ))}
      </div>

      {done && (
        <div style={GS.finishBanner}>
          <div style={{ fontSize: 28 }}><TrophyIcon size={28} color="#ffd60a" /></div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>All Matched!</div>
          <div style={{ opacity: 0.6 }}>Completed in {moves} moves</div>
        </div>
      )}
    </div>
  );
};

// ═══ GAME: Wordle-style ═════════════════════════════════════════════════

const WORD_LIST = ['REACT','WORLD','LIGHT','SPACE','CLOUD','FRAME','STACK','DEBUG','PIXEL','FLASH','BRAVE','CHARM','DRIFT','GLEAM','SPARK'];

const WordleGame: React.FC<{ onBack: () => void; onScore: (game: string, score: number) => void }> = ({ onBack, onScore }) => {
  const [target] = useState(() => WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (gameOver) return;
    if (e.key === 'Enter' && current.length === 5) {
      const newGuesses = [...guesses, current.toUpperCase()];
      setGuesses(newGuesses);
      if (current.toUpperCase() === target) {
        setGameOver(true);
        setWon(true);
        onScore('wordle', (7 - newGuesses.length) * 20);
      } else if (newGuesses.length >= 6) {
        setGameOver(true);
      }
      setCurrent('');
    } else if (e.key === 'Backspace') {
      setCurrent(prev => prev.slice(0, -1));
    } else if (/^[a-zA-Z]$/.test(e.key) && current.length < 5) {
      setCurrent(prev => prev + e.key.toUpperCase());
    }
  }, [current, guesses, target, gameOver, onScore]);

  const getColor = (letter: string, index: number, guess: string) => {
    if (guess[index] === target[index]) return '#30d158';
    if (target.includes(letter)) return '#ffd60a';
    return 'rgba(255,255,255,0.1)';
  };

  return (
    <div style={GS.gameContainer} tabIndex={0} onKeyDown={handleKey} ref={el => el?.focus()}>
      <div style={GS.gameHeader}>
        <button style={GS.backBtn} onClick={onBack} aria-label="Back to game list">{GI.back} Back</button>
        <h2 style={GS.gameTitle}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{GI.text}</span>Word Puzzle</h2>
      </div>

      <div style={GS.wordleBoard}>
        {Array.from({ length: 6 }).map((_, row) => {
          const guess = guesses[row] || (row === guesses.length ? current : '');
          return (
            <div key={row} style={GS.wordleRow}>
              {Array.from({ length: 5 }).map((_, col) => {
                const letter = guess[col] || '';
                const isGuessed = row < guesses.length;
                return (
                  <div
                    key={col}
                    style={{
                      ...GS.wordleCell,
                      background: isGuessed ? getColor(letter, col, guess) : letter ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isGuessed ? 'transparent' : letter ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                      transform: isGuessed ? 'scale(1)' : letter ? 'scale(1.05)' : 'scale(1)',
                    }}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* On-screen keyboard */}
      <div style={GS.wordleKeyboard}>
        {['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {ri === 2 && (
              <button style={{ ...GS.wordleKey, width: 50 }} onClick={() => {
                if (!gameOver && current.length === 5) {
                  const fakeEvent = { key: 'Enter', preventDefault: () => {} } as any;
                  handleKey(fakeEvent);
                }
              }} aria-label="Submit guess">↵</button>
            )}
            {row.split('').map(letter => {
              let bg = 'rgba(255,255,255,0.08)';
              let color = '#fff';
              let found = false;
              for (const g of guesses) {
                for (let gi = 0; gi < g.length; gi++) {
                  if (g[gi] === letter) {
                    found = true;
                    if (g[gi] === target[gi]) { bg = '#30d158'; break; }
                    else if (target.includes(letter)) bg = '#ffd60a';
                    else { bg = 'rgba(255,255,255,0.04)'; color = 'rgba(255,255,255,0.3)'; }
                  }
                }
                if (bg === '#30d158') break;
              }
              if (found && bg === 'rgba(255,255,255,0.08)') { bg = 'rgba(255,255,255,0.04)'; color = 'rgba(255,255,255,0.3)'; }
              return (
                <button
                  key={letter}
                  style={{ ...GS.wordleKey, background: bg, color }}
                  onClick={() => {
                    if (!gameOver && current.length < 5) setCurrent(prev => prev + letter);
                  }}
                  aria-label={`Letter ${letter}`}
                >
                  {letter}
                </button>
              );
            })}
            {ri === 2 && (
              <button style={{ ...GS.wordleKey, width: 50 }} onClick={() => setCurrent(prev => prev.slice(0, -1))} aria-label="Backspace">⌫</button>
            )}
          </div>
        ))}
      </div>

      {gameOver && (
        <div style={GS.finishBanner}>
          <div style={{ fontSize: 28 }}>{won ? <PartyIcon size={28} color="#ffd60a" /> : <FrownIcon size={28} color="#ff453a" />}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{won ? `Got it in ${guesses.length}!` : `The word was ${target}`}</div>
        </div>
      )}
    </div>
  );
};

// ═══ GAME: Reaction Time ════════════════════════════════════════════════

const ReactionGame: React.FC<{ onBack: () => void; onScore: (game: string, score: number) => void }> = ({ onBack, onScore }) => {
  const [state, setState] = useState<'waiting' | 'ready' | 'go' | 'result' | 'early'>('waiting');
  const [times, setTimes] = useState<number[]>([]);
  const [goTime, setGoTime] = useState(0);
  const timerRef = useRef<any>(null);

  const startRound = useCallback(() => {
    setState('ready');
    const delay = 1500 + Math.random() * 3000;
    timerRef.current = setTimeout(() => {
      setState('go');
      setGoTime(Date.now());
    }, delay);
  }, []);

  // Clean up timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleClick = useCallback(() => {
    if (state === 'waiting') {
      startRound();
    } else if (state === 'ready') {
      clearTimeout(timerRef.current);
      setState('early');
    } else if (state === 'go') {
      const reaction = Date.now() - goTime;
      const newTimes = [...times, reaction];
      setTimes(newTimes);
      setState('result');
      if (newTimes.length >= 5) {
        const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length);
        onScore('reaction', Math.max(500 - avg, 10));
      }
    } else if (state === 'result' || state === 'early') {
      if (times.length < 5) startRound();
    }
  }, [state, goTime, times, startRound, onScore]);

  const avg = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  return (
    <div style={GS.gameContainer}>
      <div style={GS.gameHeader}>
        <button style={GS.backBtn} onClick={onBack} aria-label="Back to game list">{GI.back} Back</button>
        <h2 style={GS.gameTitle}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{GI.zap}</span>Reaction Time</h2>
      </div>

      <div
        style={{
          ...GS.reactionBox,
          background: state === 'go' ? '#30d158' : state === 'ready' ? '#ff453a' : state === 'early' ? '#ff9f0a' : 'rgba(255,255,255,0.06)',
          cursor: 'pointer',
        }}
        onClick={handleClick}
      >
        {state === 'waiting' && <div><div style={{ fontSize: 36 }}><BoltIcon size={36} color="#ffd60a" /></div><div style={{ fontWeight: 700, fontSize: 18, marginTop: 12 }}>Click to Start</div><div style={{ opacity: 0.5, marginTop: 4 }}>5 rounds</div></div>}
        {state === 'ready' && <div><div style={{ fontSize: 36 }}><CircleIcon size={36} color="#ff453a" /></div><div style={{ fontWeight: 700, fontSize: 18, marginTop: 12 }}>Wait for green...</div></div>}
        {state === 'go' && <div><div style={{ fontSize: 36 }}><CircleIcon size={36} color="#30d158" /></div><div style={{ fontWeight: 700, fontSize: 22, marginTop: 12 }}>CLICK NOW!</div></div>}
        {state === 'early' && <div><div style={{ fontSize: 36 }}><WarningIcon size={36} color="#ff9f0a" /></div><div style={{ fontWeight: 700, fontSize: 18, marginTop: 12 }}>Too early! Click to retry</div></div>}
        {state === 'result' && <div><div style={{ fontSize: 36 }}><CheckCircleIcon size={36} color="#30d158" /></div><div style={{ fontWeight: 700, fontSize: 22, marginTop: 12 }}>{times[times.length - 1]}ms</div><div style={{ opacity: 0.6, marginTop: 4 }}>Round {times.length}/5 • Click to continue</div></div>}
      </div>

      {times.length > 0 && (
        <div style={GS.statsRow}>
          <div style={GS.statBox}>
            <div style={GS.statValue}>{avg}ms</div>
            <div style={GS.statLabel}>Average</div>
          </div>
          <div style={GS.statBox}>
            <div style={GS.statValue}>{Math.min(...times)}ms</div>
            <div style={GS.statLabel}>Best</div>
          </div>
          <div style={GS.statBox}>
            <div style={GS.statValue}>{times.length}/5</div>
            <div style={GS.statLabel}>Rounds</div>
          </div>
        </div>
      )}

      {times.length >= 5 && (
        <div style={GS.finishBanner}>
          <div style={{ fontSize: 28 }}><FlagIcon size={28} color="#0a84ff" /></div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Average: {avg}ms</div>
          <div style={{ opacity: 0.6 }}>
            {avg < 200 ? 'Lightning fast!' : avg < 300 ? 'Great reflexes!' : avg < 400 ? 'Good!' : 'Keep practicing!'}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══ GAME: Minesweeper ═════════════════════════════════════════════════

const MINE_SIZE = 8;
const MINE_COUNT = 10;

type MineCell = { mine: boolean; revealed: boolean; flagged: boolean; adjacent: number };

function createMineField(): MineCell[][] {
  const grid: MineCell[][] = Array.from({ length: MINE_SIZE }, () =>
    Array.from({ length: MINE_SIZE }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }))
  );
  // Place mines
  let placed = 0;
  while (placed < MINE_COUNT) {
    const r = Math.floor(Math.random() * MINE_SIZE);
    const c = Math.floor(Math.random() * MINE_SIZE);
    if (!grid[r][c].mine) {
      grid[r][c].mine = true;
      placed++;
    }
  }
  // Count adjacents
  for (let r = 0; r < MINE_SIZE; r++) {
    for (let c = 0; c < MINE_SIZE; c++) {
      if (grid[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < MINE_SIZE && nc >= 0 && nc < MINE_SIZE && grid[nr][nc].mine) count++;
        }
      }
      grid[r][c].adjacent = count;
    }
  }
  return grid;
}

const MinesweeperGame: React.FC<{ onBack: () => void; onScore: (game: string, score: number) => void }> = ({ onBack, onScore }) => {
  const [grid, setGrid] = useState<MineCell[][]>(() => createMineField());
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [startTime] = useState(Date.now());

  const reveal = useCallback((r: number, c: number) => {
    if (gameOver) return;
    setGrid(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      if (next[r][c].flagged || next[r][c].revealed) return prev;

      if (next[r][c].mine) {
        // Game over — reveal all mines
        for (let i = 0; i < MINE_SIZE; i++)
          for (let j = 0; j < MINE_SIZE; j++)
            if (next[i][j].mine) next[i][j].revealed = true;
        setGameOver(true);
        return next;
      }

      // Flood fill
      const queue: [number, number][] = [[r, c]];
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr < 0 || cr >= MINE_SIZE || cc < 0 || cc >= MINE_SIZE) continue;
        if (next[cr][cc].revealed || next[cr][cc].mine || next[cr][cc].flagged) continue;
        next[cr][cc].revealed = true;
        if (next[cr][cc].adjacent === 0) {
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++)
              queue.push([cr + dr, cc + dc]);
        }
      }

      // Check win
      let unrevealed = 0;
      for (let i = 0; i < MINE_SIZE; i++)
        for (let j = 0; j < MINE_SIZE; j++)
          if (!next[i][j].revealed && !next[i][j].mine) unrevealed++;
      if (unrevealed === 0) {
        setGameOver(true);
        setWon(true);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        onScore('minesweeper', Math.max(200 - elapsed, 10));
      }
      return next;
    });
  }, [gameOver, startTime, onScore]);

  const toggleFlag = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (gameOver) return;
    setGrid(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      if (!next[r][c].revealed) next[r][c].flagged = !next[r][c].flagged;
      return next;
    });
  }, [gameOver]);

  const ADJ_COLORS: Record<number, string> = { 1: '#0a84ff', 2: '#30d158', 3: '#ff453a', 4: '#5e5ce6', 5: '#ff9f0a', 6: '#64d2ff', 7: '#000', 8: '#888' };

  return (
    <div style={GS.gameContainer}>
      <div style={GS.gameHeader}>
        <button style={GS.backBtn} onClick={onBack} aria-label="Back to game list">{GI.back} Back</button>
        <h2 style={GS.gameTitle}><span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 8 }}>{GI.bomb}</span>Minesweeper</h2>
        <span style={{ opacity: 0.4, fontSize: 12 }}>Right-click to flag</span>
      </div>

      <div style={GS.mineGrid}>
        {grid.map((row, r) => (
          <div key={r} style={{ display: 'flex', gap: 2 }}>
            {row.map((cell, c) => (
              <div
                key={c}
                style={{
                  ...GS.mineCell,
                  background: cell.revealed
                    ? cell.mine ? '#ff453a22' : 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.08)',
                  cursor: gameOver ? 'default' : 'pointer',
                }}
                onClick={() => reveal(r, c)}
                onContextMenu={e => toggleFlag(e, r, c)}
              >
                {cell.revealed && cell.mine && <BombIcon size={16} color="#ff453a" />}
                {cell.revealed && !cell.mine && cell.adjacent > 0 && (
                  <span style={{ color: ADJ_COLORS[cell.adjacent], fontWeight: 700, fontSize: 13 }}>{cell.adjacent}</span>
                )}
                {!cell.revealed && cell.flagged && <FlagIcon size={14} color="#ff9f0a" />}
              </div>
            ))}
          </div>
        ))}
      </div>

      {gameOver && (
        <div style={GS.finishBanner}>
          <div style={{ fontSize: 28 }}>{won ? <TrophyIcon size={28} color="#ffd60a" /> : <BombIcon size={28} color="#ff453a" />}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{won ? 'You won!' : 'Game Over!'}</div>
        </div>
      )}
    </div>
  );
};

// ═══ Game Lobby ═════════════════════════════════════════════════════════

const GAME_CATALOG = [
  { id: 'typing' as GameId, title: 'Typing Speed', icon: GI.keyboard, color: '#0a84ff', desc: 'Test your typing speed & accuracy', badge: 'WPM' },
  { id: 'memory' as GameId, title: 'Memory Match', icon: GI.grid, color: '#bf5af2', desc: 'Flip cards & find matching pairs', badge: 'Pairs' },
  { id: 'wordle' as GameId, title: 'Word Puzzle', icon: GI.text, color: '#30d158', desc: 'Guess the 5-letter word in 6 tries', badge: '5-Letter' },
  { id: 'reaction' as GameId, title: 'Reaction Time', icon: GI.zap, color: '#ff9f0a', desc: 'Test your reflexes in 5 rounds', badge: 'Speed' },
  { id: 'minesweeper' as GameId, title: 'Minesweeper', icon: GI.bomb, color: '#ff453a', desc: 'Clear the board without hitting mines', badge: '8×8' },
];

// ═══ Main Component ═════════════════════════════════════════════════════

const Games: React.FC = () => {
  const [currentGame, setCurrentGame] = useState<GameId>('lobby');
  const [stats, setStats] = useState<GameStats>(loadStats);

  const handleScore = useCallback((game: string, score: number) => {
    setStats(prev => {
      const next: GameStats = {
        gamesPlayed: prev.gamesPlayed + 1,
        totalTime: prev.totalTime + 1,
        bestScores: {
          ...prev.bestScores,
          [game]: Math.max(prev.bestScores[game] || 0, score),
        },
      };
      saveStats(next);
      window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'gamesPlayed', amount: 1 } }));
      return next;
    });
  }, []);

  const goBack = useCallback(() => setCurrentGame('lobby'), []);

  // Render active game
  if (currentGame === 'typing') return <TypingGame onBack={goBack} onScore={handleScore} />;
  if (currentGame === 'memory') return <MemoryGame onBack={goBack} onScore={handleScore} />;
  if (currentGame === 'wordle') return <WordleGame onBack={goBack} onScore={handleScore} />;
  if (currentGame === 'reaction') return <ReactionGame onBack={goBack} onScore={handleScore} />;
  if (currentGame === 'minesweeper') return <MinesweeperGame onBack={goBack} onScore={handleScore} />;

  // Lobby
  return (
    <div style={GS.lobby} role="region" aria-label="Games Center">
      {/* Header */}
      <div style={GS.lobbyHeader}>
        <div>
          <h1 style={GS.lobbyTitle}>Games</h1>
          <p style={GS.lobbySubtitle}>Play, train, and challenge yourself</p>
        </div>
        <div style={GS.statsChip}>
          {GI.trophy}
          <span>{stats.gamesPlayed} games played</span>
        </div>
      </div>

      {/* Best scores */}
      {Object.keys(stats.bestScores).length > 0 && (
        <div style={GS.scoresRow}>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.4, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Best Scores</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            {Object.entries(stats.bestScores).map(([game, score]) => (
              <div key={game} style={GS.scoreChip}>
                {GI.star}
                <span style={{ textTransform: 'capitalize' as const }}>{game}</span>
                <span style={{ fontWeight: 700 }}>{score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game grid */}
      <div style={GS.gameGrid} role="list" aria-label="Available games">
        {GAME_CATALOG.map(game => (
          <div
            key={game.id}
            role="listitem"
            tabIndex={0}
            aria-label={`Play ${game.title}`}
            style={GS.gameCard}
            onClick={() => setCurrentGame(game.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurrentGame(game.id); } }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            <div style={{ ...GS.gameCardIcon, background: `${game.color}18`, color: game.color }}>
              {game.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={GS.gameCardTitle}>{game.title}</div>
              <div style={GS.gameCardDesc}>{game.desc}</div>
            </div>
            <div style={{ ...GS.gameCardBadge, background: `${game.color}18`, color: game.color }}>
              {game.badge}
            </div>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div style={GS.tipBox}>
        <LightbulbIcon size={14} color="#ffd60a" /> <strong>Tip:</strong> Playing brain games regularly can improve memory, reaction time, and focus. Try to beat your best scores!
      </div>
    </div>
  );
};

// ═══ Styles ═════════════════════════════════════════════════════════════

const GS: Record<string, React.CSSProperties> = {
  // Lobby
  lobby: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 32px',
    overflow: 'auto',
    gap: 24,
    color: 'var(--color-text-primary, #fafafa)',
  },
  lobbyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lobbyTitle: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: 0,
  },
  lobbySubtitle: {
    fontSize: 14,
    opacity: 0.45,
    marginTop: 4,
  },
  statsChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 13,
    fontWeight: 500,
    color: '#ffd60a',
  },
  scoresRow: {
    padding: '16px 20px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
  },
  scoreChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 12,
    fontWeight: 500,
    color: '#ffd60a',
  },
  gameGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  gameCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '16px 20px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  gameCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gameCardTitle: {
    fontSize: 15,
    fontWeight: 700,
  },
  gameCardDesc: {
    fontSize: 12,
    opacity: 0.45,
    marginTop: 2,
  },
  gameCardBadge: {
    padding: '4px 12px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    flexShrink: 0,
  },
  tipBox: {
    padding: '14px 18px',
    borderRadius: 12,
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.22)',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
  },

  // Shared game UI
  gameContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px',
    overflow: 'auto',
    gap: 20,
    outline: 'none',
  },
  gameHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 600,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.10)',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: 800,
    margin: 0,
    flex: 1,
  },
  statsRow: {
    display: 'flex',
    gap: 24,
    justifyContent: 'center',
  },
  statBox: {
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 800,
    color: 'var(--color-accent)',
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.4,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  finishBanner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '24px',
    borderRadius: 16,
    background: 'rgba(48,209,88,0.14)',
    border: '1px solid rgba(48,209,88,0.28)',
    boxShadow: '0 4px 16px rgba(48,209,88,0.15)',
    textAlign: 'center' as const,
  },
  playAgainBtn: {
    marginTop: 8,
    padding: '10px 24px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--color-accent)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(10,132,255,0.4)',
    transition: 'all 0.15s ease',
  },

  // Typing
  typingTarget: {
    maxWidth: 560,
    padding: '20px 24px',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.10)',
    fontSize: 18,
    fontFamily: '"SF Mono", monospace',
    lineHeight: 1.7,
    letterSpacing: '0.02em',
  },
  typingInput: {
    width: '100%',
    maxWidth: 560,
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.07)',
    color: 'var(--color-text-primary, #fafafa)',
    fontSize: 16,
    fontFamily: '"SF Mono", monospace',
    outline: 'none',
  },

  // Memory
  memoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 72px)',
    gap: 8,
    justifyContent: 'center',
  },
  memoryCard: {
    width: 72,
    height: 72,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.10)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    transition: 'all 0.2s ease',
    userSelect: 'none' as const,
    color: 'rgba(255,255,255,0.3)',
  },
  memoryCardFlipped: {
    background: 'rgba(59,130,246,0.18)',
    border: '1px solid rgba(59,130,246,0.35)',
    color: '#fff',
  },

  // Wordle
  wordleBoard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  wordleRow: {
    display: 'flex',
    gap: 6,
    justifyContent: 'center',
  },
  wordleCell: {
    width: 52,
    height: 52,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
    transition: 'all 0.15s ease',
    textTransform: 'uppercase' as const,
  },
  wordleKeyboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 12,
  },
  wordleKey: {
    width: 34,
    height: 40,
    borderRadius: 8,
    border: 'none',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#fff',
    transition: 'all 0.1s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Reaction
  reactionBox: {
    width: '100%',
    maxWidth: 400,
    height: 280,
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    transition: 'background 0.15s ease',
    userSelect: 'none' as const,
  },

  // Minesweeper
  mineGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  mineCell: {
    width: 36,
    height: 36,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    transition: 'all 0.1s',
    userSelect: 'none' as const,
  },
};

Games.displayName = 'Games';
export default memo(Games);
