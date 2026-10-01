import { Component, type ReactNode } from 'react';

interface FeatureErrorBoundaryProps {
  label: string;
  children: ReactNode;
}

interface FeatureErrorBoundaryState {
  failed: boolean;
}

export class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state = { failed: false };

  static getDerivedStateFromError(): FeatureErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="feature-error" role="alert">
        <strong>{this.props.label} stopped after a renderer error.</strong>
        <span>The component details are available in the terminal, developer console, diagnostics export, and MCP diagnostics.</span>
        <button type="button" onClick={() => this.setState({ failed: false })}>Reload this panel</button>
      </section>
    );
  }
}
