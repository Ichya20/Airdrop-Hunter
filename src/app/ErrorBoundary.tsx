import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  error: Error | null
}

/** Mencegah layar kosong bila ada error render; pengguna dapat mencoba lagi atau memuat ulang. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AirdropHunter: kesalahan tampilan', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>Tampilan mengalami kesalahan</h1>
        <p>Data tidak dikirim ke mana pun. Coba tampilkan ulang atau muat ulang halaman.</p>
        <pre className="crash__detail">{error.message}</pre>
        <div className="button-row">
          <button type="button" className="btn btn--primary" onClick={() => this.setState({ error: null })}>
            Coba tampilkan ulang
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            Muat ulang halaman
          </button>
        </div>
      </main>
    )
  }
}
