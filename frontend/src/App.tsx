import { useState } from "react";

interface QueryResponse {
  answer: string;
  sources: string[];
}

function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  async function handleAsk() {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setSourcesOpen(false);

    try {
      const res = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 5 }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data: QueryResponse = await res.json();
      setAnswer(data.answer);
      setSources(data.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold">Docs Assistant</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-3">
          <textarea
            className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Ask a question about internal docs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAsk();
            }}
          />
          <button
            onClick={handleAsk}
            disabled={loading || !query.trim()}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Asking..." : "Ask"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {answer && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Answer
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {answer}
            </p>
          </div>
        )}

        {sources.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 uppercase tracking-wide"
            >
              <span>Sources ({sources.length})</span>
              <span>{sourcesOpen ? "−" : "+"}</span>
            </button>

            {sourcesOpen && (
              <ul className="border-t border-gray-100 divide-y divide-gray-100">
                {sources.map((src, i) => (
                  <li key={i} className="px-4 py-3 text-sm">
                    <a
                      href={`http://localhost:8000/source-docs/${src}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {src}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
