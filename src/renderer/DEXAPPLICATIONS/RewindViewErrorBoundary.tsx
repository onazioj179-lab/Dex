import React from 'react';

interface Props {
  viewName: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  showDetails: boolean;
  resetKey: number;
}

export class RewindViewErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      showDetails: false,
      resetKey: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown error',
    };
  }

  componentDidCatch(error: Error): void {
    const dex = (window as any).dex;
    try {
      dex?.diagnostics?.reportError?.({ message: `[Rewind:${this.props.viewName}] ${error.message}`, stack: error.stack });
    } catch {
      // Ignore
    }
  }

  private reloadView = () => {
    this.setState(prev => ({ hasError: false, showDetails: false, resetKey: prev.resetKey + 1 }));
  };

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.resetKey}>{this.props.children}</div>;
    }

    return (
      <div style={{
        border: '1px solid rgba(255,59,48,0.25)',
        background: 'rgba(255,59,48,0.08)',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>View error in {this.props.viewName}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Something went wrong in this view. The issue was logged.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={this.reloadView}
            style={{
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              padding: '6px 10px',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload view
          </button>
          <button
            onClick={() => this.setState(prev => ({ ...prev, showDetails: !prev.showDetails }))}
            style={{
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              padding: '6px 10px',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            {this.state.showDetails ? 'Hide error details' : 'View error details'}
          </button>
        </div>
        {this.state.showDetails && (
          <pre style={{
            margin: 0,
            padding: 8,
            borderRadius: 6,
            background: 'rgba(0,0,0,0.2)',
            fontSize: 11,
            overflowX: 'auto',
          }}>{this.state.errorMessage}</pre>
        )}
      </div>
    );
  }
}
