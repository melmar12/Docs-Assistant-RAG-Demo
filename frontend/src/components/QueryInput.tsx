interface QueryInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function QueryInput({ query, onQueryChange, onSubmit, loading }: QueryInputProps) {
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
      <button
        onClick={onSubmit}
        disabled={loading || !query.trim()}
        className="bg-purple-600 hover:bg-purple-700 dark:bg-vsc-accent-muted dark:hover:bg-vsc-accent dark:text-vsc-bg text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Asking..." : "Ask"}
      </button>
    </div>
  );
}
