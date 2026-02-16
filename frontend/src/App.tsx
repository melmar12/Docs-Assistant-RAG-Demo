import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

interface ChunkResult {
  doc_id: string;
  score: number;
  text: string;
}

interface QueryResponse {
  answer: string;
  sources: string[];
  chunks: ChunkResult[];
}

const STORAGE_KEY = "docs-assistant-state";

interface PersistedState {
  submittedQuery: string | null;
  answer: string | null;
  sources: string[];
  chunks: ChunkResult[];
}

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function App() {
  const saved = loadPersistedState();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(saved?.submittedQuery ?? null);
  const [answer, setAnswer] = useState<string | null>(saved?.answer ?? null);
  const [sources, setSources] = useState<string[]>(saved?.sources ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [chunks, setChunks] = useState<ChunkResult[]>(saved?.chunks ?? []);
  const [chunksOpen, setChunksOpen] = useState(false);

  useEffect(() => {
    const state: PersistedState = { submittedQuery, answer, sources, chunks };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [submittedQuery, answer, sources, chunks]);

  async function handleAsk() {
    if (!query.trim()) return;

    const currentQuery = query.trim();
    setQuery("");
    setLoading(true);
    setError(null);
    setSubmittedQuery(null);
    setAnswer(null);
    setSources([]);
    setSourcesOpen(false);
    setChunks([]);
    setChunksOpen(false);

    try {
      const res = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: currentQuery, top_k: 5 }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data: QueryResponse = await res.json();
      setSubmittedQuery(currentQuery);
      setAnswer(data.answer);
      setSources(data.sources);
      setChunks(data.chunks);
    } catch (e) {
      setSubmittedQuery(currentQuery);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Docs Assistant</h1>
        <a
          href="http://localhost:8000/source-docs"
          className="text-sm text-blue-600 hover:underline"
        >
          Browse Docs
        </a>
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

        {submittedQuery && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Question
            </h2>
            <p className="text-sm text-gray-900">{submittedQuery}</p>
          </div>
        )}

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
            <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-100 prose-pre:rounded-lg">
              <ReactMarkdown>
                {answer.replace(
                  /\(Source:\s*([^)]+\.md)\)/g,
                  (_match, filename) =>
                    `(Source: [${filename}](http://localhost:8000/source-docs/${filename}))`
                )}
              </ReactMarkdown>
            </div>
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

        {chunks.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg">
            <button
              onClick={() => setChunksOpen(!chunksOpen)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 uppercase tracking-wide"
            >
              <span>Retrieved Chunks ({chunks.length})</span>
              <span>{chunksOpen ? "−" : "+"}</span>
            </button>

            {chunksOpen && (
              <ul className="border-t border-gray-100 divide-y divide-gray-100">
                {chunks.map((chunk, i) => (
                  <li key={i} className="px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{chunk.doc_id}</span>
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {chunk.score.toFixed(4)}
                      </span>
                    </div>
                    <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                      {chunk.text}
                    </pre>
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
