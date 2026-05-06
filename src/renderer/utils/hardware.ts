// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Hardware Integration (Phase M: Items 826-845)
// MIDI, gamepad, tablet support, multi-monitor, and system integration
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MIDIMessage {
  type: 'noteon' | 'noteoff' | 'controlchange' | 'programchange' | 'pitchbend' | 'sysex';
  channel: number;
  data: number[];
  timestamp: number;
}

export interface MIDIMapping {
  id: string;
  name: string;
  deviceId: string;
  channel: number;
  control: number;
  action: string;
  min?: number;
  max?: number;
}

export interface GamepadState {
  id: string;
  connected: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  timestamp: number;
}

export interface GamepadMapping {
  id: string;
  buttonIndex?: number;
  axisIndex?: number;
  action: string;
  threshold?: number;
}

export interface TabletState {
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  tangentialPressure: number;
  pointerType: 'pen' | 'touch' | 'mouse';
}

export interface DisplayInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
  isInternal: boolean;
  colorDepth: number;
  colorGamut?: 'srgb' | 'p3' | 'rec2020';
  hdr?: boolean;
}

export interface SystemStatus {
  isIdle: boolean;
  idleTime: number;
  batteryLevel?: number;
  isCharging?: boolean;
  cpuUsage?: number;
  memoryUsage?: number;
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
}

// ---------------------------------------------------------------------------
// 826-828. MIDI Support
// ---------------------------------------------------------------------------

class MIDIManager {
  private midiAccess: MIDIAccess | null = null;
  private inputs: Map<string, MIDIInput> = new Map();
  private outputs: Map<string, MIDIOutput> = new Map();
  private mappings: Map<string, MIDIMapping> = new Map();
  private listeners: ((message: MIDIMessage, deviceId: string) => void)[] = [];

  // 826. Initialize MIDI
  async init(): Promise<boolean> {
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.setupDevices();
      
      this.midiAccess.onstatechange = () => this.setupDevices();
      return true;
    } catch {
      return false;
    }
  }

  private setupDevices(): void {
    if (!this.midiAccess) return;

    // Clear old references
    this.inputs.clear();
    this.outputs.clear();

    // Setup inputs
    this.midiAccess.inputs.forEach((input, id) => {
      this.inputs.set(id, input);
      input.onmidimessage = (e) => this.handleMessage(e, id);
    });

    // Setup outputs
    this.midiAccess.outputs.forEach((output, id) => {
      this.outputs.set(id, output);
    });
  }

  private handleMessage(event: MIDIMessageEvent, deviceId: string): void {
    const [status, data1, data2] = event.data || [];
    const channel = status & 0x0f;
    const type = this.getMessageType(status);

    const message: MIDIMessage = {
      type,
      channel,
      data: [data1, data2],
      timestamp: event.timeStamp,
    };

    // Check mappings
    this.checkMapping(message, deviceId);

    // Notify listeners
    this.listeners.forEach(l => l(message, deviceId));
  }

  private getMessageType(status: number): MIDIMessage['type'] {
    const command = status & 0xf0;
    switch (command) {
      case 0x90: return 'noteon';
      case 0x80: return 'noteoff';
      case 0xb0: return 'controlchange';
      case 0xc0: return 'programchange';
      case 0xe0: return 'pitchbend';
      case 0xf0: return 'sysex';
      default: return 'controlchange';
    }
  }

  // 827. MIDI Mapping
  addMapping(mapping: MIDIMapping): void {
    this.mappings.set(mapping.id, mapping);
  }

  removeMapping(id: string): boolean {
    return this.mappings.delete(id);
  }

  getMapping(id: string): MIDIMapping | undefined {
    return this.mappings.get(id);
  }

  getAllMappings(): MIDIMapping[] {
    return Array.from(this.mappings.values());
  }

  private checkMapping(message: MIDIMessage, deviceId: string): void {
    this.mappings.forEach(mapping => {
      if (mapping.deviceId !== deviceId) return;
      if (mapping.channel !== message.channel) return;
      if (message.type !== 'controlchange') return;
      if (mapping.control !== message.data[0]) return;

      // Trigger action with normalized value
      const value = message.data[1] / 127;
      const normalized = mapping.min !== undefined && mapping.max !== undefined
        ? mapping.min + value * (mapping.max - mapping.min)
        : value;

      this.triggerAction(mapping.action, normalized);
    });
  }

  private triggerAction(action: string, value: number): void {
    // Dispatch custom event for action handling
    window.dispatchEvent(new CustomEvent('midi-action', {
      detail: { action, value },
    }));
  }

  // 828. MIDI Output
  sendMessage(outputId: string, data: number[]): void {
    const output = this.outputs.get(outputId);
    output?.send(data);
  }

  sendNoteOn(outputId: string, channel: number, note: number, velocity: number): void {
    this.sendMessage(outputId, [0x90 | channel, note, velocity]);
  }

  sendNoteOff(outputId: string, channel: number, note: number): void {
    this.sendMessage(outputId, [0x80 | channel, note, 0]);
  }

  sendControlChange(outputId: string, channel: number, control: number, value: number): void {
    this.sendMessage(outputId, [0xb0 | channel, control, value]);
  }

  onMessage(callback: (message: MIDIMessage, deviceId: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getInputs(): { id: string; name: string }[] {
    return Array.from(this.inputs.entries()).map(([id, input]) => ({
      id,
      name: input.name || 'Unknown MIDI Input',
    }));
  }

  getOutputs(): { id: string; name: string }[] {
    return Array.from(this.outputs.entries()).map(([id, output]) => ({
      id,
      name: output.name || 'Unknown MIDI Output',
    }));
  }
}

export const midiManager = new MIDIManager();

// ---------------------------------------------------------------------------
// 829-831. Gamepad Support
// ---------------------------------------------------------------------------

class GamepadManager {
  private gamepads: Map<number, Gamepad> = new Map();
  private mappings: Map<string, GamepadMapping> = new Map();
  private listeners: ((state: GamepadState) => void)[] = [];
  private polling = false;
  private pollId: number | null = null;
  private deadzone = 0.1;

  // 829. Initialize Gamepad
  init(): void {
    window.addEventListener('gamepadconnected', this.handleConnect.bind(this));
    window.addEventListener('gamepaddisconnected', this.handleDisconnect.bind(this));
    this.startPolling();
  }

  private handleConnect(e: GamepadEvent): void {
    this.gamepads.set(e.gamepad.index, e.gamepad);
  }

  private handleDisconnect(e: GamepadEvent): void {
    this.gamepads.delete(e.gamepad.index);
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;

    const poll = () => {
      if (!this.polling) return;

      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) {
        if (!gamepad) continue;
        this.gamepads.set(gamepad.index, gamepad);
        this.processGamepad(gamepad);
      }

      this.pollId = requestAnimationFrame(poll);
    };

    this.pollId = requestAnimationFrame(poll);
  }

  stopPolling(): void {
    this.polling = false;
    if (this.pollId !== null) {
      cancelAnimationFrame(this.pollId);
      this.pollId = null;
    }
  }

  private processGamepad(gamepad: Gamepad): void {
    const state: GamepadState = {
      id: gamepad.id,
      connected: gamepad.connected,
      buttons: gamepad.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
      axes: gamepad.axes.map(a => Math.abs(a) < this.deadzone ? 0 : a),
      timestamp: gamepad.timestamp,
    };

    // Check mappings
    this.checkMappings(state);

    // Notify listeners
    this.listeners.forEach(l => l(state));
  }

  // 830. Gamepad Mapping
  addMapping(mapping: GamepadMapping): void {
    this.mappings.set(mapping.id, mapping);
  }

  removeMapping(id: string): boolean {
    return this.mappings.delete(id);
  }

  private checkMappings(state: GamepadState): void {
    this.mappings.forEach(mapping => {
      if (mapping.buttonIndex !== undefined) {
        const button = state.buttons[mapping.buttonIndex];
        if (button?.pressed) {
          this.triggerAction(mapping.action, button.value);
        }
      }

      if (mapping.axisIndex !== undefined) {
        const axis = state.axes[mapping.axisIndex];
        const threshold = mapping.threshold ?? 0.5;
        if (Math.abs(axis) > threshold) {
          this.triggerAction(mapping.action, axis);
        }
      }
    });
  }

  private triggerAction(action: string, value: number): void {
    window.dispatchEvent(new CustomEvent('gamepad-action', {
      detail: { action, value },
    }));
  }

  // 831. Haptic Feedback
  vibrate(
    gamepadIndex: number,
    duration: number,
    strongMagnitude: number,
    weakMagnitude: number
  ): void {
    const gamepad = this.gamepads.get(gamepadIndex);
    if (gamepad?.vibrationActuator) {
      (gamepad.vibrationActuator as unknown as { playEffect: (type: string, params: object) => void }).playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        strongMagnitude,
        weakMagnitude,
      });
    }
  }

  setDeadzone(value: number): void {
    this.deadzone = Math.max(0, Math.min(1, value));
  }

  onState(callback: (state: GamepadState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getConnectedGamepads(): { index: number; id: string }[] {
    return Array.from(this.gamepads.entries()).map(([index, gp]) => ({
      index,
      id: gp.id,
    }));
  }
}

export const gamepadManager = new GamepadManager();

// ---------------------------------------------------------------------------
// 832-834. Drawing Tablet Support
// ---------------------------------------------------------------------------

class TabletManager {
  private listeners: ((state: TabletState) => void)[] = [];
  private enabled = false;
  private pressureCurve: (pressure: number) => number = p => p;

  // 832. Initialize Tablet
  init(): void {
    if (this.enabled) return;
    this.enabled = true;

    document.addEventListener('pointermove', this.handlePointer.bind(this), { passive: true });
    document.addEventListener('pointerdown', this.handlePointer.bind(this), { passive: true });
  }

  private handlePointer(e: PointerEvent): void {
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;

    const state: TabletState = {
      pressure: this.pressureCurve(e.pressure),
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      tangentialPressure: e.tangentialPressure,
      pointerType: e.pointerType as 'pen' | 'touch',
    };

    this.listeners.forEach(l => l(state));
  }

  // 833. Pressure Curve
  setPressureCurve(curve: 'linear' | 'soft' | 'firm' | 'custom', customFn?: (p: number) => number): void {
    switch (curve) {
      case 'linear':
        this.pressureCurve = p => p;
        break;
      case 'soft':
        this.pressureCurve = p => Math.sqrt(p);
        break;
      case 'firm':
        this.pressureCurve = p => p * p;
        break;
      case 'custom':
        if (customFn) this.pressureCurve = customFn;
        break;
    }
  }

  // 834. Barrel Button Mapping
  onState(callback: (state: TabletState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getCapabilities(): { pressure: boolean; tilt: boolean; twist: boolean } {
    return {
      pressure: true, // Most tablets support pressure
      tilt: true,
      twist: false, // Rare
    };
  }
}

export const tabletManager = new TabletManager();

// ---------------------------------------------------------------------------
// 835-838. Multi-Monitor Support
// ---------------------------------------------------------------------------

class DisplayManager {
  private displays: DisplayInfo[] = [];
  private listeners: ((displays: DisplayInfo[]) => void)[] = [];

  // 835. Detect Displays
  async detectDisplays(): Promise<DisplayInfo[]> {
    // Use Screen API if available
    if ('getScreenDetails' in window) {
      try {
        const screenDetails = await (window as unknown as { getScreenDetails: () => Promise<{ screens: Screen[] }> }).getScreenDetails();
        this.displays = screenDetails.screens.map((screen, index) => ({
          id: `screen-${index}`,
          x: (screen as unknown as { left: number }).left ?? 0,
          y: (screen as unknown as { top: number }).top ?? 0,
          width: screen.width,
          height: screen.height,
          scaleFactor: window.devicePixelRatio,
          isPrimary: (screen as unknown as { isPrimary: boolean }).isPrimary ?? index === 0,
          isInternal: (screen as unknown as { isInternal: boolean }).isInternal ?? false,
          colorDepth: screen.colorDepth,
        }));
      } catch {
        // Fall back to single screen
        this.displays = [this.getPrimaryDisplay()];
      }
    } else {
      this.displays = [this.getPrimaryDisplay()];
    }

    this.notifyListeners();
    return this.displays;
  }

  private getPrimaryDisplay(): DisplayInfo {
    return {
      id: 'primary',
      x: 0,
      y: 0,
      width: window.screen.width,
      height: window.screen.height,
      scaleFactor: window.devicePixelRatio,
      isPrimary: true,
      isInternal: true,
      colorDepth: window.screen.colorDepth,
    };
  }

  getDisplays(): DisplayInfo[] {
    return [...this.displays];
  }

  getPrimary(): DisplayInfo | undefined {
    return this.displays.find(d => d.isPrimary);
  }

  // 836. DPI Scaling
  getScaleFactor(displayId?: string): number {
    if (displayId) {
      const display = this.displays.find(d => d.id === displayId);
      return display?.scaleFactor ?? window.devicePixelRatio;
    }
    return window.devicePixelRatio;
  }

  scaleValue(value: number, displayId?: string): number {
    return value * this.getScaleFactor(displayId);
  }

  unscaleValue(value: number, displayId?: string): number {
    return value / this.getScaleFactor(displayId);
  }

  // 837. HDR Support
  isHDRSupported(): boolean {
    return window.matchMedia('(dynamic-range: high)').matches;
  }

  getColorGamut(): 'srgb' | 'p3' | 'rec2020' {
    if (window.matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
    if (window.matchMedia('(color-gamut: p3)').matches) return 'p3';
    return 'srgb';
  }

  // 838. Window Positioning
  moveWindowToDisplay(displayId: string, center = true): void {
    const display = this.displays.find(d => d.id === displayId);
    if (!display) return;

    const x = center 
      ? display.x + (display.width - window.outerWidth) / 2
      : display.x;
    const y = center
      ? display.y + (display.height - window.outerHeight) / 2
      : display.y;

    window.moveTo(x, y);
  }

  onDisplayChange(callback: (displays: DisplayInfo[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.displays));
  }
}

export const displayManager = new DisplayManager();

// ---------------------------------------------------------------------------
// 839-842. System Integration
// ---------------------------------------------------------------------------

class SystemIntegration {
  private idleThreshold = 60000; // 1 minute
  private idleTimer: NodeJS.Timeout | null = null;
  private lastActivity = Date.now();
  private listeners: ((status: SystemStatus) => void)[] = [];

  // 839. Idle Detection
  startIdleDetection(threshold?: number): void {
    if (threshold) this.idleThreshold = threshold;
    
    const handleActivity = () => {
      this.lastActivity = Date.now();
    };

    document.addEventListener('mousemove', handleActivity, { passive: true });
    document.addEventListener('keydown', handleActivity, { passive: true });
    document.addEventListener('touchstart', handleActivity, { passive: true });

    this.idleTimer = setInterval(() => {
      this.notifyListeners();
    }, 1000);
  }

  stopIdleDetection(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  isIdle(): boolean {
    return Date.now() - this.lastActivity > this.idleThreshold;
  }

  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  // 840. Battery Status
  async getBatteryStatus(): Promise<{ level: number; charging: boolean } | null> {
    try {
      const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> }).getBattery();
      return {
        level: battery.level * 100,
        charging: battery.charging,
      };
    } catch {
      return null;
    }
  }

  // 841. Power Management
  async preventSleep(): Promise<boolean> {
    try {
      const wakeLock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } }).wakeLock.request('screen');
      return !!wakeLock;
    } catch {
      return false;
    }
  }

  // 842. Thermal Monitoring
  getThermalState(): 'nominal' | 'fair' | 'serious' | 'critical' {
    // Estimate based on performance
    const now = performance.now();
    const frames: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      frames.push(performance.now() - now);
    }
    
    const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
    
    if (avgFrameTime > 100) return 'critical';
    if (avgFrameTime > 50) return 'serious';
    if (avgFrameTime > 20) return 'fair';
    return 'nominal';
  }

  getStatus(): SystemStatus {
    return {
      isIdle: this.isIdle(),
      idleTime: this.getIdleTime(),
      thermalState: this.getThermalState(),
    };
  }

  onStatusChange(callback: (status: SystemStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.getStatus()));
  }
}

export const systemIntegration = new SystemIntegration();

// ---------------------------------------------------------------------------
// 843-845. External Device Support
// ---------------------------------------------------------------------------

// 843. USB Device Access
class USBDeviceManager {
  private devices: Map<string, USBDevice> = new Map();

  async requestDevice(filters?: USBDeviceFilter[]): Promise<USBDevice | null> {
    try {
      const device = await (navigator as unknown as { usb: { requestDevice: (options: { filters?: USBDeviceFilter[] }) => Promise<USBDevice> } }).usb.requestDevice({
        filters: filters || [],
      });
      this.devices.set(device.serialNumber || 'unknown', device);
      return device;
    } catch {
      return null;
    }
  }

  async getConnectedDevices(): Promise<USBDevice[]> {
    try {
      return await (navigator as unknown as { usb: { getDevices: () => Promise<USBDevice[]> } }).usb.getDevices();
    } catch {
      return [];
    }
  }
}

export const usbDeviceManager = new USBDeviceManager();

// 844. Serial Port Access
class SerialPortManager {
  private ports: Map<string, SerialPort> = new Map();

  async requestPort(): Promise<SerialPort | null> {
    try {
      const port = await (navigator as unknown as { serial: { requestPort: () => Promise<SerialPort> } }).serial.requestPort();
      return port;
    } catch {
      return null;
    }
  }

  async getConnectedPorts(): Promise<SerialPort[]> {
    try {
      return await (navigator as unknown as { serial: { getPorts: () => Promise<SerialPort[]> } }).serial.getPorts();
    } catch {
      return [];
    }
  }

  async openPort(port: SerialPort, options: SerialOptions): Promise<boolean> {
    try {
      await port.open(options);
      return true;
    } catch {
      return false;
    }
  }

  async closePort(port: SerialPort): Promise<void> {
    await port.close();
  }
}

export const serialPortManager = new SerialPortManager();

// 845. HID Device Support
class HIDDeviceManager {
  private devices: Map<string, HIDDevice> = new Map();

  async requestDevice(filters?: HIDDeviceFilter[]): Promise<HIDDevice | null> {
    try {
      const devices = await (navigator as unknown as { hid: { requestDevice: (options: { filters?: HIDDeviceFilter[] }) => Promise<HIDDevice[]> } }).hid.requestDevice({
        filters: filters || [],
      });
      if (devices.length > 0) {
        const device = devices[0];
        this.devices.set(device.productName || 'unknown', device);
        return device;
      }
      return null;
    } catch {
      return null;
    }
  }

  async getConnectedDevices(): Promise<HIDDevice[]> {
    try {
      return await (navigator as unknown as { hid: { getDevices: () => Promise<HIDDevice[]> } }).hid.getDevices();
    } catch {
      return [];
    }
  }

  async openDevice(device: HIDDevice): Promise<boolean> {
    try {
      await device.open();
      return true;
    } catch {
      return false;
    }
  }

  async closeDevice(device: HIDDevice): Promise<void> {
    await device.close();
  }

  async sendReport(device: HIDDevice, reportId: number, data: BufferSource): Promise<void> {
    await device.sendReport(reportId, data);
  }
}

export const hidDeviceManager = new HIDDeviceManager();

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function useMIDI() {
  const [ready, setReady] = useState(false);
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([]);
  const [outputs, setOutputs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    midiManager.init().then(success => {
      setReady(success);
      if (success) {
        setInputs(midiManager.getInputs());
        setOutputs(midiManager.getOutputs());
      }
    });
  }, []);

  const onMessage = useCallback((callback: (message: MIDIMessage, deviceId: string) => void) => {
    return midiManager.onMessage(callback);
  }, []);

  return { ready, inputs, outputs, onMessage, manager: midiManager };
}

export function useGamepad() {
  const [gamepads, setGamepads] = useState<{ index: number; id: string }[]>([]);
  const [state, setState] = useState<GamepadState | null>(null);

  useEffect(() => {
    gamepadManager.init();
    
    const updateGamepads = () => {
      setGamepads(gamepadManager.getConnectedGamepads());
    };

    window.addEventListener('gamepadconnected', updateGamepads);
    window.addEventListener('gamepaddisconnected', updateGamepads);

    const unsubscribe = gamepadManager.onState(setState);

    return () => {
      unsubscribe();
      window.removeEventListener('gamepadconnected', updateGamepads);
      window.removeEventListener('gamepaddisconnected', updateGamepads);
    };
  }, []);

  return { gamepads, state, manager: gamepadManager };
}

export function useTablet() {
  const [state, setState] = useState<TabletState | null>(null);

  useEffect(() => {
    tabletManager.init();
    return tabletManager.onState(setState);
  }, []);

  return { state, manager: tabletManager };
}

export function useDisplays() {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  useEffect(() => {
    displayManager.detectDisplays().then(setDisplays);
    return displayManager.onDisplayChange(setDisplays);
  }, []);

  return {
    displays,
    primary: displays.find(d => d.isPrimary),
    isHDR: displayManager.isHDRSupported(),
    colorGamut: displayManager.getColorGamut(),
    manager: displayManager,
  };
}

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    isIdle: false,
    idleTime: 0,
    thermalState: 'nominal',
  });

  useEffect(() => {
    systemIntegration.startIdleDetection();
    const unsubscribe = systemIntegration.onStatusChange(setStatus);

    return () => {
      systemIntegration.stopIdleDetection();
      unsubscribe();
    };
  }, []);

  return status;
}

export function useWakeLock() {
  const [active, setActive] = useState(false);

  const requestWakeLock = useCallback(async () => {
    const success = await systemIntegration.preventSleep();
    setActive(success);
    return success;
  }, []);

  return { active, request: requestWakeLock };
}
