/**
 * Collapsible panel listing the source documents used to generate
 * the answer. Each source is a clickable link that opens the
 * document in the doc browser.
 */

interface SourcesPanelProps {
  sources: string[];
  open: boolean;
  onToggle: () => void;
  onSelectSource: (source: string) => void;
}
export default function SourcesPanel({ sources, open, onToggle, onSelectSource }: SourcesPanelProps) {
  if (sources.length === 0) return null;

  return (
    <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="sources-panel"
        className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide"
      >
        <span>Sources ({sources.length})</span>
        <span aria-hidden="true">{open ? "\u2212" : "+"}</span>
      </button>

      {open && (
        <ul id="sources-panel" className="border-t border-gray-100 dark:border-vsc-border divide-y divide-gray-100 dark:divide-vsc-border">
          {sources.map((src, i) => (
            <li key={i} className="px-4 py-3 text-sm">
              <button
                onClick={() => onSelectSource(src)}
                className="text-purple-600 hover:text-purple-700 dark:text-vsc-link dark:hover:text-vsc-link-hover hover:underline"
              >
                {src}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
