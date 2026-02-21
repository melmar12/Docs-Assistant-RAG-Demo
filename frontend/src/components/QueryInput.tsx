/**
 * Text input area for submitting questions to the RAG backend.
 * Supports Enter to submit, Shift+Enter for newlines, and an
 * optional "Start Over" button to reset the conversation.
 */

interface QueryInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onReset?: () => void;
  loading: boolean;
  showReset?: boolean;
}
export default function QueryInput({ query, onQueryChange, onSubmit, onReset, loading, showReset }: QueryInputProps) {
  return (
    <div className="space-y-3">
      <textarea
        className="w-full border border-gray-300 dark:border-vsc-border bg-white dark:bg-vsc-input rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-vsc-accent-muted text-gray-900 dark:text-vsc-text placeholder-gray-400 dark:placeholder-vsc-text-faint"
        rows={4}
        placeholder="Ask a question about internal docs..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 dark:bg-vsc-accent-muted dark:hover:bg-vsc-accent dark:text-vsc-bg text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Asking...
            </>
          ) : "Ask"}
        </button>
        {showReset && (
          <button
            onClick={onReset}
            className="border border-gray-300 dark:border-vsc-border text-gray-600 dark:text-vsc-text-muted hover:bg-gray-100 dark:hover:bg-vsc-surface px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Start Over
          </button>
        )}
      </div>
    </div>
  );
}
