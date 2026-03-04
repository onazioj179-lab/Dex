/**
 * DEX -- Renderer Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './styles/design-system.css';

// Top-level error boundary to prevent unrecoverable white screen
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.error('[DEX] Fatal render error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0a0f', color: '#e5e5ea', fontFamily: 'Inter, system-ui, sans-serif', gap: 16,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>DEX encountered a critical error</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: '#0a84ff', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', marginTop: 8,
              boxShadow: '0 4px 16px rgba(10,132,255,0.35)',
            }}
          >Reload DEX</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root')!;

ReactDOM.createRoot(root).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
