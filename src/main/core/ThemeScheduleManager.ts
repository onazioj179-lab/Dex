// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Theme Schedule Manager (Feature 36)
// Automatic theme switching based on time of day or sunrise/sunset.
// ==========================================================================

import { ipcMain, BrowserWindow, nativeTheme } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

interface ThemeSchedule {
  mode: string;
  lightStart: string;
  darkStart: string;
  latitude: number;
  longitude: number;
}

class ThemeScheduleManager {
  private mainWindow: BrowserWindow | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private currentTheme: string = 'system';

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.loadSchedule();
    this.registerIPC();
    this.startScheduleCheck();
    log.info('[ThemeSchedule] Theme schedule manager initialized');
  }

  private loadSchedule(): void {
    const mode = databaseManager.getSetting('theme_schedule_mode', 'system');
    this.currentTheme = mode;
  }

  private getSchedule(): ThemeSchedule {
    return {
      mode: databaseManager.getSetting('theme_schedule_mode', 'system'),
      lightStart: databaseManager.getSetting('theme_light_start', '07:00'),
      darkStart: databaseManager.getSetting('theme_dark_start', '19:00'),
      latitude: parseFloat(databaseManager.getSetting('theme_latitude', '0')),
      longitude: parseFloat(databaseManager.getSetting('theme_longitude', '0')),
    };
  }

  private startScheduleCheck(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      this.applyScheduledTheme();
    }, 60000); // check every minute
    setTimeout(() => this.applyScheduledTheme(), 1000);
  }

  private applyScheduledTheme(): void {
    const schedule = this.getSchedule();

    if (schedule.mode === 'system') {
      nativeTheme.themeSource = 'system';
      this.notifyTheme('system');
      return;
    }

    if (schedule.mode === 'manual-light') {
      nativeTheme.themeSource = 'light';
      this.notifyTheme('light');
      return;
    }

    if (schedule.mode === 'manual-dark') {
      nativeTheme.themeSource = 'dark';
      this.notifyTheme('dark');
      return;
    }

    if (schedule.mode === 'scheduled') {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const isLight = currentTime >= schedule.lightStart && currentTime < schedule.darkStart;
      nativeTheme.themeSource = isLight ? 'light' : 'dark';
      this.notifyTheme(isLight ? 'light' : 'dark');
      return;
    }

    if (schedule.mode === 'solar') {
      const sunTimes = this.computeSunTimes(schedule.latitude, schedule.longitude);
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const isLight = currentTime >= sunTimes.sunrise && currentTime < sunTimes.sunset;
      nativeTheme.themeSource = isLight ? 'light' : 'dark';
      this.notifyTheme(isLight ? 'light' : 'dark');
      return;
    }
  }

  private computeSunTimes(lat: number, lon: number): { sunrise: string; sunset: string } {
    // Simplified sunrise/sunset calculation using day of year and latitude
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / 86400000);

    // Solar declination (simplified)
    const declination = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const decRad = (declination * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;

    // Hour angle
    let cosH = -Math.tan(latRad) * Math.tan(decRad);
    cosH = Math.max(-1, Math.min(1, cosH));
    const hourAngle = (Math.acos(cosH) * 180) / Math.PI;

    // Solar noon (approximate, without timezone offset precision)
    const solarNoon = 12 - lon / 15;

    const sunriseHour = solarNoon - hourAngle / 15;
    const sunsetHour = solarNoon + hourAngle / 15;

    const clamp = (h: number): string => {
      const clamped = Math.max(0, Math.min(23.99, h));
      const hours = Math.floor(clamped);
      const minutes = Math.floor((clamped - hours) * 60);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    return {
      sunrise: clamp(sunriseHour),
      sunset: clamp(sunsetHour),
    };
  }

  private notifyTheme(theme: string): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('theme-schedule:changed', { theme });
    }
  }

  setMode(mode: string): void {
    const validModes = ['system', 'manual-light', 'manual-dark', 'scheduled', 'solar'];
    if (!validModes.includes(mode)) return;
    databaseManager.setSetting('theme_schedule_mode', mode);
    this.applyScheduledTheme();
  }

  setScheduleTimes(lightStart: string, darkStart: string): void {
    databaseManager.setSetting('theme_light_start', lightStart);
    databaseManager.setSetting('theme_dark_start', darkStart);
    this.applyScheduledTheme();
  }

  setLocation(latitude: number, longitude: number): void {
    databaseManager.setSetting('theme_latitude', String(latitude));
    databaseManager.setSetting('theme_longitude', String(longitude));
    this.applyScheduledTheme();
  }

  getCurrentInfo(): { schedule: ThemeSchedule; currentTheme: string; sunTimes?: { sunrise: string; sunset: string } } {
    const schedule = this.getSchedule();
    const result: any = { schedule, currentTheme: this.currentTheme };
    if (schedule.mode === 'solar' && schedule.latitude !== 0) {
      result.sunTimes = this.computeSunTimes(schedule.latitude, schedule.longitude);
    }
    return result;
  }

  private registerIPC(): void {
    ipcMain.handle('theme-schedule:getInfo', async () => {
      return this.getCurrentInfo();
    });

    ipcMain.handle('theme-schedule:setMode', async (_event, mode: string) => {
      this.setMode(mode);
    });

    ipcMain.handle('theme-schedule:setTimes', async (_event, lightStart: string, darkStart: string) => {
      this.setScheduleTimes(lightStart, darkStart);
    });

    ipcMain.handle('theme-schedule:setLocation', async (_event, latitude: number, longitude: number) => {
      this.setLocation(latitude, longitude);
    });
  }
}

export const themeScheduleManager = new ThemeScheduleManager();
