import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const STORAGE_KEY = "docs-assistant-state";
const THEME_KEY = "docs-assistant-theme";

type View = { page: "home" } | { page: "docs"; selected: string | null };

interface PersistedState {
  submittedQuery: string | null;
  answer: string | null;
  sources: string[];
  chunks: ChunkResult[];
}

function loadPersistedState(): PersistedState | null {
  const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  if (navEntry?.type === "reload") {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function App() {
  const [saved] = useState(loadPersistedState);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored !== null ? stored === "dark" : true;
  });
  const [view, setView] = useState<View>({ page: "home" });
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(saved?.submittedQuery ?? null);
  const [answer, setAnswer] = useState<string | null>(saved?.answer ?? null);
  const [sources, setSources] = useState<string[]>(saved?.sources ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [chunks, setChunks] = useState<ChunkResult[]>(saved?.chunks ?? []);
  const [chunksOpen, setChunksOpen] = useState(false);
  const [docList, setDocList] = useState<string[]>([]);
  const [docContent, setDocContent] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const state: PersistedState = { submittedQuery, answer, sources, chunks };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      const res = await fetch(`${API_URL}/query`, {
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

  async function navigateToDocs(filename?: string) {
    setView({ page: "docs", selected: filename ?? null });
    if (!filename) setDocContent(undefined);
    if (docList.length === 0) {
      try {
        const res = await fetch(`${API_URL}/api/docs`);
        if (!res.ok) throw new Error("Failed to load docs");
        const data: string[] = await res.json();
        setDocList(data);
      } catch (e) {
        console.error("Failed to load doc list:", e);
        setDocList([]);
      }
    }
    if (filename) {
      loadDoc(filename);
    }
  }

  async function loadDoc(filename: string) {
    try {
      const res = await fetch(`${API_URL}/api/docs/${filename}`);
      if (!res.ok) throw new Error("Failed to load doc");
      const data = await res.json();
      setDocContent(data.content);
    } catch (e) {
      console.error("Failed to load document:", e);
      setDocContent(null);
    }
  }

  function selectDoc(filename: string) {
    setView({ page: "docs", selected: filename });
    loadDoc(filename);
  }

  function stripFrontmatter(content: string) {
    return content.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart();
  }

  function formatDocTitle(filename: string) {
    return filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  const markdownComponents = {
    pre: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    code: ({ className, children, ...props }: { className?: string; children: React.ReactNode }) => {
      const match = /language-(\w+)/.exec(className || "");
      const inline = !className && !String(children).includes("\n");
      return !inline ? (
        <SyntaxHighlighter
          style={darkMode ? oneDark : oneLight}
          language={match ? match[1] : "text"}
          customStyle={{ margin: 0, borderRadius: "0.5rem", fontSize: "0.8rem" }}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>{children}</code>
      );
    },
  };

  const headerLink = view.page === "home"
    ? { label: "Browse Docs", action: () => navigateToDocs() }
    : { label: "Back to Assistant", action: () => setView({ page: "home" }) };

  return (
    <div className={`min-h-screen bg-gray-50 text-gray-900 dark:bg-vsc-bg dark:text-vsc-text ${darkMode ? "dark" : ""}`}>
      <header className="bg-white border-b border-gray-200 dark:bg-vsc-surface dark:border-vsc-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-vsc-text">Docs Assistant</h1>
          <button
            onClick={headerLink.action}
            className="text-sm text-purple-600 hover:text-purple-700 dark:text-vsc-link dark:hover:text-vsc-link-hover hover:underline"
          >
            {headerLink.label}
          </button>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:text-vsc-text-muted dark:hover:text-vsc-text hover:bg-gray-100 dark:hover:bg-vsc-hover transition-colors"
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className={`mx-auto px-4 py-8 space-y-6 ${view.page === "docs" ? "max-w-6xl" : "max-w-3xl"}`}>
        {view.page === "home" && (
          <>
            <div className="space-y-3">
              <textarea
                className="w-full border border-gray-300 dark:border-vsc-border bg-white dark:bg-vsc-input rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-vsc-accent-muted text-gray-900 dark:text-vsc-text placeholder-gray-400 dark:placeholder-vsc-text-faint"
                rows={4}
                placeholder="Ask a question about internal docs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
              />
              <button
                onClick={handleAsk}
                disabled={loading || !query.trim()}
                className="bg-purple-600 hover:bg-purple-700 dark:bg-vsc-accent-muted dark:hover:bg-vsc-accent dark:text-vsc-bg text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Asking..." : "Ask"}
              </button>
            </div>

            {submittedQuery && (
              <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg p-4">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide mb-1">
                  Question
                </h2>
                <p className="text-sm text-gray-900 dark:text-vsc-text">{submittedQuery}</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-lg p-4 text-sm">
                {error}
              </div>
            )}

            {answer && (
              <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg p-5">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide mb-2">
                  Answer
                </h2>
                <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-2 prose-p:text-gray-700 dark:prose-p:text-vsc-text prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-gray-700 dark:prose-li:text-vsc-text prose-code:bg-gray-100 dark:prose-code:bg-vsc-code-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 dark:prose-code:text-vsc-text prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-100 dark:prose-pre:bg-vsc-code-bg prose-pre:rounded-lg prose-headings:text-purple-900 dark:prose-headings:text-vsc-heading prose-a:text-purple-600 dark:prose-a:text-vsc-link prose-strong:text-gray-900 dark:prose-strong:text-vsc-text prose-th:text-gray-900 dark:prose-th:text-vsc-text prose-td:text-gray-700 dark:prose-td:text-vsc-text prose-table:border-collapse prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-600 prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-600 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      ...markdownComponents,
                      a: ({ href, children }) => {
                        const docMatch = href?.match(/^#doc\/(.+\.md)$/);
                        if (docMatch) {
                          return (
                            <button
                              onClick={() => navigateToDocs(docMatch[1])}
                              className="text-purple-600 dark:text-vsc-link hover:underline"
                            >
                              {children}
                            </button>
                          );
                        }
                        return <a href={href}>{children}</a>;
                      },
                    }}
                  >
                    {answer.replace(
                      /\(Source:\s*([^)]+\.md)\)/g,
                      (_match, filename) =>
                        `(Source: [${filename}](#doc/${filename}))`
                    )}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {sources.length > 0 && (
              <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg">
                <button
                  onClick={() => setSourcesOpen(!sourcesOpen)}
                  className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide"
                >
                  <span>Sources ({sources.length})</span>
                  <span>{sourcesOpen ? "\u2212" : "+"}</span>
                </button>

                {sourcesOpen && (
                  <ul className="border-t border-gray-100 dark:border-vsc-border divide-y divide-gray-100 dark:divide-vsc-border">
                    {sources.map((src, i) => (
                      <li key={i} className="px-4 py-3 text-sm">
                        <button
                          onClick={() => navigateToDocs(src)}
                          className="text-purple-600 hover:text-purple-700 dark:text-vsc-link dark:hover:text-vsc-link-hover hover:underline"
                        >
                          {src}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {chunks.length > 0 && (
              <div className="bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg">
                <button
                  onClick={() => setChunksOpen(!chunksOpen)}
                  className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide"
                >
                  <span>Retrieved Chunks ({chunks.length})</span>
                  <span>{chunksOpen ? "\u2212" : "+"}</span>
                </button>

                {chunksOpen && (
                  <ul className="border-t border-gray-100 dark:border-vsc-border divide-y divide-gray-100 dark:divide-vsc-border">
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
            )}
          </>
        )}

        {view.page === "docs" && (
          <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
            <aside className="w-64 shrink-0 bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg overflow-y-auto">
              <h2 className="text-sm font-semibold text-purple-700 dark:text-vsc-accent uppercase tracking-wide p-4 pb-2">Documentation</h2>
              <ul className="border-t border-gray-100 dark:border-vsc-border">
                {docList.map((filename) => {
                  const isSelected = view.selected === filename;
                  return (
                    <li key={filename}>
                      <button
                        onClick={() => selectDoc(filename)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          isSelected
                            ? "bg-purple-50 dark:bg-vsc-selected text-purple-700 dark:text-vsc-accent font-medium"
                            : "text-gray-700 dark:text-vsc-text-muted hover:bg-gray-50 dark:hover:bg-vsc-hover"
                        }`}
                      >
                        {formatDocTitle(filename)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="flex-1 min-w-0 bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg p-6 overflow-y-auto">
              {!view.selected ? (
                <p className="text-sm text-gray-500 dark:text-vsc-text-faint">Select a document to view.</p>
              ) : docContent === undefined ? (
                <p className="text-sm text-gray-500 dark:text-vsc-text-faint">Loading...</p>
              ) : docContent ? (
                <div className="prose prose-sm max-w-none prose-p:my-2 prose-p:text-gray-700 dark:prose-p:text-vsc-text prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-gray-700 dark:prose-li:text-vsc-text prose-code:bg-gray-100 dark:prose-code:bg-vsc-code-bg prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 dark:prose-code:text-vsc-text prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-100 dark:prose-pre:bg-vsc-code-bg prose-pre:rounded-lg prose-headings:text-purple-900 dark:prose-headings:text-vsc-heading prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-vsc-border prose-h1:pb-2 prose-a:text-purple-600 dark:prose-a:text-vsc-link prose-strong:text-gray-900 dark:prose-strong:text-vsc-text prose-th:text-gray-900 dark:prose-th:text-vsc-text prose-td:text-gray-700 dark:prose-td:text-vsc-text-muted prose-table:border-collapse prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-600 prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-600 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}
                  >{stripFrontmatter(docContent)}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400">Failed to load document.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
