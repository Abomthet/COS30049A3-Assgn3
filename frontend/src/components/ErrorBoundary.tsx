import { Component, type ReactNode } from 'react';
import { StatePanel } from './StatePanel';

interface Props {
  children: ReactNode;
  /** When this changes, a failed part gets another try (the shell passes the current route). */
  resetKey?: string;
}

/**
 * Keeps a crash in one part of the page from blanking the rest (catalogue: "Part of a view
 * crashed"). The header, navigation and footer sit outside it and keep working.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StatePanel
        tone="error"
        title="This part of the page failed to load"
        live="alert"
        testId="state-crashed"
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ failed: false })}>
            Reload this part
          </button>
        }
      >
        <p>The rest of the page still works. If this keeps happening, reload the whole page.</p>
      </StatePanel>
    );
  }
}
