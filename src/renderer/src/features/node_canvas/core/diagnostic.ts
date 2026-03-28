export type DiagnosticLevel = 'info' | 'warning' | 'error'

export interface Diagnostic {
  level: DiagnosticLevel
  code: string
  message: string
  path?: string
  hint?: string
}

export function errorDiag(code: string, message: string, path?: string, hint?: string): Diagnostic {
  return { level: 'error', code, message, path, hint }
}
