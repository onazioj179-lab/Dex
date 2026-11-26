// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { createContext, useContext } from 'react';

type Theme = 'light' | 'dark';
export type AppAppearanceAttributes = {
  'data-theme'?: Theme;
  'data-app-theme'?: Theme;
  'data-app-motion'?: 'reduced';
};

export const AppAppearanceContext = createContext<AppAppearanceAttributes>({});

export function useAppAppearance() {
  return useContext(AppAppearanceContext);
}
