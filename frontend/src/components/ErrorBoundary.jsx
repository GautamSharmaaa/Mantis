import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Mantis UI error:", error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__panel">
            <p className="panel__eyebrow">Something Broke</p>
            <h1>Mantis hit an unexpected UI error.</h1>
            <p className="section-copy">
              Your local resume data is still available. Reload the page to recover the workspace.
            </p>
            <div className="error-boundary__actions">
              <button className="primary-button" onClick={() => window.location.reload()} type="button">
                Reload App
              </button>
              <button className="secondary-button" onClick={this.handleReset} type="button">
                Retry View
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
