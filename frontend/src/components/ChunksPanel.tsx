/**
 * Collapsible panel showing the raw retrieved chunks from the
 * vector database, including doc IDs, similarity scores, and
 * chunk text. Useful for transparency into the RAG pipeline.
 */

interface ChunkResult {
  doc_id: string;
  score: number;
  text: string;
}

interface ChunksPanelProps {
  chunks: ChunkResult[];
  open: boolean;
  onToggle: () => void;
}
export default function ChunksPanel({ chunks, open, onToggle }: ChunksPanelProps) {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="chunks-panel"
        className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide"
      >
        <span>Retrieved Chunks ({chunks.length})</span>
        <span aria-hidden="true">{open ? "\u2212" : "+"}</span>
      </button>

      {open && (
        <ul id="chunks-panel" className="border-t border-gray-100 dark:border-vsc-border divide-y divide-gray-100 dark:divide-vsc-border">
          {chunks.map((chunk, i) => (
            <li key={i} className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-vsc-text">{chunk.doc_id}</span>
                <span className="text-xs font-mono bg-purple-100 dark:bg-vsc-badge-bg text-purple-700 dark:text-vsc-badge-text px-1.5 py-0.5 rounded">
                  {chunk.score.toFixed(4)}
                </span>
              </div>
              <pre className="text-xs text-gray-600 dark:text-vsc-text-muted bg-gray-50 dark:bg-vsc-code-bg rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                {chunk.text}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
