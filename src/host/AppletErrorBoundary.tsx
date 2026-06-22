import React from 'react';

// Contains a failure in the rendered applet tree (e.g. RemoteRootRenderer throws
// "No component found for remote element: X" when an applet emits a disallowed
// element) so it degrades to a per-applet error inside the applet surface instead
// of unmounting the whole trusted shell. Pairs with worker-side termination.
interface Props {
  children: React.ReactNode;
  onReload: () => void;
}
interface State {
  error?: string;
}

export class AppletErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return {error: error instanceof Error ? error.message : String(error)};
  }

  componentDidCatch(error: unknown) {
    // Structured, non-PHI signal — the message is a host/runtime error, not applet data.
    console.error('Applet render failed (contained):', error instanceof Error ? error.message : error);
  }

  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <div className="applet-error" role="alert">
        <strong>This applet hit a runtime error and was stopped.</strong>
        <p>{this.state.error}</p>
        <button className="applet-error-reload" onClick={this.props.onReload}>
          Reload applet
        </button>
      </div>
    );
  }
}
