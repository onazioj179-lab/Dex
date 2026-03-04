import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

type RewindLogLevel = 'debug' | 'info' | 'warn' | 'error';

class RewindLogger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'rewind', 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.prune();
  }

  debug(module: string, message: string) { this.write('debug', module, message); }
  info(module: string, message: string) { this.write('info', module, message); }
  warn(module: string, message: string) { this.write('warn', module, message); }
  error(module: string, message: string) { this.write('error', module, message); }

  async readTodayLog(): Promise<string> {
    const file = this.filePathFor(new Date());
    try {
      return await fs.promises.readFile(file, 'utf-8');
    } catch {
      return '';
    }
  }

  openFolderPath(): string {
    return this.logDir;
  }

  private write(level: RewindLogLevel, module: string, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} | ${level.toUpperCase()} | ${module} | ${message}\n`;

    if (process.env.NODE_ENV !== 'production') {
      if (level === 'error') console.error(line.trim());
      else if (level === 'warn') console.warn(line.trim());
      else console.log(line.trim());
    }

    if (process.env.NODE_ENV === 'production' && !['warn', 'error'].includes(level)) {
      return;
    }

    const file = this.filePathFor(new Date());
    fs.promises.appendFile(file, line, 'utf-8').catch(() => {});
  }

  private filePathFor(date: Date): string {
    const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return path.join(this.logDir, `rewind-${d}.log`);
  }

  private prune(): void {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => /^rewind-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .map(name => ({ name, mtime: fs.statSync(path.join(this.logDir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const old of files.slice(7)) {
        fs.unlinkSync(path.join(this.logDir, old.name));
      }
    } catch {
      return;
    }
  }
}

export const rewindLogger = new RewindLogger();
