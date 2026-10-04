import { semanticTone, toneStyle } from './semantics'
import type { SemanticKind } from './semantics'

export default function SemanticTag({ kind, value, className = '' }: { kind: SemanticKind; value: string; className?: string }) {
  const tone = semanticTone(kind, value)
  return <span className={`semantic-tag ${className}`} data-kind={kind} data-tone={tone} style={toneStyle(tone)}><i aria-hidden="true"/>{value}</span>
}
