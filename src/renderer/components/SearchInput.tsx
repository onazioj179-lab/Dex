// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SearchInput -- DEPRECATED compatibility shim.
 *
 * There is now ONE canonical search field: `DexSearchInput` in
 * styles/components.tsx. It shares the global control rhythm (sm/md/lg =
 * 28/32/40, identical to Button/TextInput) and lays the magnifier, input and
 * clear button out with flexbox so they are always vertically centered and
 * the same height -- which is exactly the alignment this older component could
 * not guarantee.
 *
 * This module re-exports the canonical one so existing import paths keep
 * working while every search bar resolves to a single source of truth. Prefer
 * importing `{ DexSearchInput }` from '../styles/components' in new code.
 */
export {
  DexSearchInput as SearchInput,
  DexSearchInput as default,
} from '../styles/components';
export type { DexSearchInputProps as SearchInputProps } from '../styles/components';
