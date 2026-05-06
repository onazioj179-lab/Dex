// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Voice Memo Manager (Feature 17)
// Records audio notes attached to notes/tasks with Whisper transcription.
// ==========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { exec } from 'child_process';
import { databaseManager } from './DatabaseManager';

export interface VoiceMemo {
  id: number;
  app: string;
  parent_type: string;
  parent_id: string;
  filepath: string;
  duration_ms: number;
  transcription: string;
  transcribed: number;
  created_at: number;
}

class VoiceMemoManager {
  private mainWindow: BrowserWindow | null = null;
  private memosDir: string;
  private whisperAvailable: boolean = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.memosDir = path.join(userDataPath, 'voice-memos');
  }

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    if (!fs.existsSync(this.memosDir)) {
      fs.mkdirSync(this.memosDir, { recursive: true });
    }
    this.createTables();
    this.checkWhisperAvailability();
    this.registerIPC();
    log.info('[VoiceMemo] Voice memo manager initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS voice_memos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app TEXT NOT NULL,
        parent_type TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        filepath TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        transcription TEXT DEFAULT '',
        transcribed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_voice_memos_parent ON voice_memos(app, parent_type, parent_id);
    `);
  }

  private checkWhisperAvailability(): void {
    try {
      const whisperPath = path.join(app.getPath('userData'), 'whisper', 'whisper.wasm');
      this.whisperAvailable = fs.existsSync(whisperPath);
    } catch {
      this.whisperAvailable = false;
    }
  }

  saveMemo(appName: string, parentType: string, parentId: string, audioBuffer: Buffer, durationMs: number): VoiceMemo | null {
    const db = this.getDb();
    if (!db) return null;

    try {
      const filename = `memo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.opus`;
      const filepath = path.join(this.memosDir, filename);
      fs.writeFileSync(filepath, audioBuffer);

      const now = Date.now();
      const result = db.prepare(
        `INSERT INTO voice_memos (app, parent_type, parent_id, filepath, duration_ms, transcription, transcribed, created_at)
         VALUES (?, ?, ?, ?, ?, '', 0, ?)`
      ).run(appName, parentType, parentId, filepath, durationMs, now);

      const memoId = Number(result.lastInsertRowid);

      if (this.whisperAvailable) {
        this.transcribeAsync(memoId, filepath);
      }

      return {
        id: memoId, app: appName, parent_type: parentType, parent_id: parentId,
        filepath, duration_ms: durationMs, transcription: '', transcribed: 0,
        created_at: now,
      };
    } catch (err) {
      log.warn('[VoiceMemo] Save error:', err);
      return null;
    }
  }

  private async transcribeAsync(memoId: number, filepath: string): Promise<void> {
    try {
      const transcription = await this.runSpeechRecognition(filepath);
      if (!transcription) {
        log.info(`[VoiceMemo] No transcription engine available for memo ${memoId}`);
        return; // Leave transcribed = 0 rather than saving placeholder text
      }
      const db = this.getDb();
      if (db) {
        db.prepare('UPDATE voice_memos SET transcription = ?, transcribed = 1 WHERE id = ?')
          .run(transcription, memoId);
        if (this.mainWindow) {
          this.mainWindow.webContents.send('voice-memo:transcriptionReady', { memoId, transcription });
        }
      }
    } catch (err) {
      log.warn('[VoiceMemo] Transcription error:', err);
    }
  }

  /**
   * Attempt speech recognition using platform APIs.
   * Windows: Windows Speech Recognition via PowerShell.
   * macOS: NSSpeechRecognizer via osascript (limited).
   * Returns null if no engine is available.
   */
  private runSpeechRecognition(filepath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const platform = process.platform;

      if (platform === 'win32') {
        // Use Windows.Media.SpeechRecognition via PowerShell
        const safePath = filepath.replace(/'/g, "''");
        const ps = `
          Add-Type -AssemblyName System.Speech
          $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
          $recognizer.SetInputToWaveFile('${safePath}')
          $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
          $result = $recognizer.Recognize()
          if ($result) { Write-Output $result.Text } else { Write-Output '' }
          $recognizer.Dispose()
        `.trim();

        exec(`powershell -NoProfile -NoLogo -NonInteractive -WindowStyle Hidden -Command "${ps.replace(/"/g, '\\"')}"`,
          { timeout: 30000, windowsHide: true },
          (err, stdout) => {
            if (err || !stdout?.trim()) return resolve(null);
            resolve(stdout.trim());
          });
      } else if (platform === 'darwin') {
        // macOS: use the `whisper` CLI if installed, or Python speech_recognition
        exec(`which whisper`, { timeout: 3000 }, (err) => {
          if (err) return resolve(null);
          const safePath = filepath.replace(/'/g, "'\\''");
          exec(`whisper '${safePath}' --model tiny --output_format txt --output_dir /tmp`,
            { timeout: 60000 },
            (err2, _stdout) => {
              if (err2) return resolve(null);
              const txtPath = filepath.replace(/\.[^.]+$/, '.txt');
              const tmpTxt = path.join('/tmp', path.basename(txtPath));
              try {
                const text = fs.readFileSync(tmpTxt, 'utf-8').trim();
                fs.unlinkSync(tmpTxt);
                resolve(text || null);
              } catch {
                resolve(null);
              }
            });
        });
      } else {
        resolve(null);
      }
    });
  }

  updateTranscription(memoId: number, transcription: string): void {
    const db = this.getDb();
    if (!db) return;
    db.prepare('UPDATE voice_memos SET transcription = ?, transcribed = 1 WHERE id = ?')
      .run(transcription, memoId);
  }

  getMemosForParent(appName: string, parentType: string, parentId: string): VoiceMemo[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM voice_memos WHERE app = ? AND parent_type = ? AND parent_id = ? ORDER BY created_at DESC'
    ).all(appName, parentType, parentId) as VoiceMemo[];
  }

  getAllMemos(): VoiceMemo[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare('SELECT * FROM voice_memos ORDER BY created_at DESC').all() as VoiceMemo[];
  }

  getMemoCount(): number {
    const db = this.getDb();
    if (!db) return 0;
    const row = db.prepare('SELECT COUNT(*) as count FROM voice_memos').get();
    return row?.count || 0;
  }

  deleteMemo(memoId: number): boolean {
    const db = this.getDb();
    if (!db) return false;

    const memo = db.prepare('SELECT * FROM voice_memos WHERE id = ?').get(memoId) as VoiceMemo | undefined;
    if (!memo) return false;

    try {
      if (fs.existsSync(memo.filepath)) {
        const expiresAt = Date.now() + (30 * 86400000);
        db.prepare(
          `INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
           VALUES (?, 'voice-memo', ?, ?, ?, ?, ?)`
        ).run(memo.app, `Voice Memo ${memo.id}`, JSON.stringify({ filepath: memo.filepath, parent_id: memo.parent_id }),
          memo.filepath, Date.now(), expiresAt);
      }
    } catch { /* non-critical */ }

    db.prepare('DELETE FROM voice_memos WHERE id = ?').run(memoId);
    return true;
  }

  isWhisperAvailable(): boolean {
    return this.whisperAvailable;
  }

  getMemosDir(): string {
    return this.memosDir;
  }

  private registerIPC(): void {
    ipcMain.handle('voice-memo:save', async (_event, appName: string, parentType: string, parentId: string, audioBase64: string, durationMs: number) => {
      const buffer = Buffer.from(audioBase64, 'base64');
      return this.saveMemo(appName, parentType, parentId, buffer, durationMs);
    });

    ipcMain.handle('voice-memo:getForParent', async (_event, appName: string, parentType: string, parentId: string) => {
      return this.getMemosForParent(appName, parentType, parentId);
    });

    ipcMain.handle('voice-memo:getAll', async () => {
      return this.getAllMemos();
    });

    ipcMain.handle('voice-memo:updateTranscription', async (_event, memoId: number, transcription: string) => {
      this.updateTranscription(memoId, transcription);
    });

    ipcMain.handle('voice-memo:delete', async (_event, memoId: number) => {
      return this.deleteMemo(memoId);
    });

    ipcMain.handle('voice-memo:isWhisperAvailable', async () => {
      return this.whisperAvailable;
    });

    ipcMain.handle('voice-memo:getCount', async () => {
      return this.getMemoCount();
    });
  }
}

export const voiceMemoManager = new VoiceMemoManager();
