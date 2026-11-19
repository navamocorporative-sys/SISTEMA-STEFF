import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error en la pantalla:', error, info)
  }

  render() {
    if (this.state.error) {
      const isChunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message)
      return (
        <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
          <h2 className="text-lg font-bold">Algo salió mal en esta pantalla</h2>
          <p className="mt-2 text-sm text-slate-500">
            {isChunk ? 'Hay una versión nueva del sistema o se perdió la conexión. Recarga la página.' : 'Recarga la página para continuar. Tu información guardada no se perdió.'}
          </p>
          <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
