// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// Web Device API Type Declarations
// WebUSB, Web Serial, and WebHID type stubs for TypeScript
// =============================================================================

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USBDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly serialNumber?: string;
  readonly manufacturerName?: string;
  readonly productName?: string;
  readonly configuration?: USBConfiguration;
  readonly configurations: USBConfiguration[];
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
}

interface USBConfiguration {
  readonly configurationValue: number;
  readonly configurationName?: string;
  readonly interfaces: USBInterface[];
}

interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
  readonly alternates: USBAlternateInterface[];
  readonly claimed: boolean;
}

interface USBAlternateInterface {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly interfaceName?: string;
  readonly endpoints: USBEndpoint[];
}

interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: 'in' | 'out';
  readonly type: 'bulk' | 'interrupt' | 'isochronous';
  readonly packetSize: number;
}

interface USBInTransferResult {
  readonly data?: DataView;
  readonly status: 'ok' | 'stall' | 'babble';
}

interface USBOutTransferResult {
  readonly bytesWritten: number;
  readonly status: 'ok' | 'stall';
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialPortInfo {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDevice {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface HIDCollectionInfo {
  readonly usagePage: number;
  readonly usage: number;
  readonly type: number;
  readonly children: HIDCollectionInfo[];
  readonly inputReports: HIDReportInfo[];
  readonly outputReports: HIDReportInfo[];
  readonly featureReports: HIDReportInfo[];
}

interface HIDReportInfo {
  readonly reportId: number;
  readonly items: HIDReportItem[];
}

interface HIDReportItem {
  readonly isAbsolute: boolean;
  readonly isArray: boolean;
  readonly isRange: boolean;
  readonly hasNull: boolean;
  readonly usageMinimum?: number;
  readonly usageMaximum?: number;
  readonly reportSize: number;
  readonly reportCount: number;
  readonly logicalMinimum: number;
  readonly logicalMaximum: number;
}

// WebGPU stubs
interface GPUAdapter {
  readonly name: string;
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUDeviceDescriptor {
  label?: string;
}

interface GPUDevice {
  readonly lost: Promise<GPUDeviceLostInfo>;
  destroy(): void;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createCommandEncoder(): GPUCommandEncoder;
  readonly queue: GPUQueue;
}

interface GPUDeviceLostInfo {
  readonly message: string;
  readonly reason: string;
}

interface GPUBuffer {
  readonly size: number;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GPUBufferDescriptor {
  size: number;
  usage: number;
  label?: string;
}

interface GPUShaderModule {}
interface GPUShaderModuleDescriptor { code: string; label?: string; }
interface GPURenderPipeline {}
interface GPURenderPipelineDescriptor { [key: string]: unknown; }
interface GPUCommandEncoder {
  finish(): GPUCommandBuffer;
}
interface GPUCommandBuffer {}
interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, offset: number, data: BufferSource): void;
}
