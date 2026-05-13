// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Typed error with a stable string code, optional cause, and machine-readable
 * details. Useful for IPC, telemetry classification, and user-facing
 * conditional UI.
 */

export interface CodedErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class CodedError<C extends string = string> extends Error {
  readonly code: C;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(code: C, message: string, options: CodedErrorOptions = {}) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }

  toJSON(): {
    name: string;
    code: C;
    message: string;
    details?: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isCodedError(value: unknown): value is CodedError {
  return value instanceof CodedError;
}

export function hasCode<C extends string>(value: unknown, code: C): value is CodedError<C> {
  return isCodedError(value) && (value.code as string) === code;
}

export function wrapError<C extends string>(
  code: C,
  message: string,
  cause: unknown,
  details?: Record<string, unknown>,
): CodedError<C> {
  return new CodedError<C>(code, message, { cause, details });
}
