/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX — Renderer Entry Point
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './styles/design-system.css';

// Performance: Disable React StrictMode double-renders in production
const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <App />
);
