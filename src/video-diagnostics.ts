export type VideoDiagnostic = {
  event: 'network' | 'decode' | 'unsupported' | 'policy' | 'fullscreen' | 'timeout' | 'aborted' | 'unknown'
  code: number; ready: number; network: number; original: boolean
}
