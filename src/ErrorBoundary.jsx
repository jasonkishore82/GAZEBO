import { Component } from 'react'

// Last line of defence: show a recoverable message instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>The eyes hit an unexpected error. Reloading usually fixes it.</p>
        <button className="btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
