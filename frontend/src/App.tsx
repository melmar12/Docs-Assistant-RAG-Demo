import { useEffect, useState } from "react";
import Header from "./components/Header";
import QueryInput from "./components/QueryInput";
import AnswerCard from "./components/AnswerCard";
import SourcesPanel from "./components/SourcesPanel";
import ChunksPanel from "./components/ChunksPanel";
import DocBrowser from "./components/DocBrowser";

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

  const headerNavLabel = view.page === "home" ? "Browse Docs" : "Back to Assistant";
  const headerNavAction = view.page === "home"
    ? () => navigateToDocs()
    : () => setView({ page: "home" });

  return (
    <div className={`min-h-screen bg-gray-50 text-gray-900 dark:bg-vsc-bg dark:text-vsc-text ${darkMode ? "dark" : ""}`}>
      <Header
        darkMode={darkMode}
        onThemeToggle={() => setDarkMode(!darkMode)}
        navLabel={headerNavLabel}
        onNavigate={headerNavAction}
      />

      <main className={`mx-auto px-4 py-8 space-y-6 ${view.page === "docs" ? "max-w-6xl" : "max-w-3xl"}`}>
        {view.page === "home" && (
          <>
            <QueryInput
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleAsk}
              loading={loading}
            />

            <AnswerCard
              submittedQuery={submittedQuery}
              answer={answer}
              error={error}
              darkMode={darkMode}
              onNavigateToDoc={(filename) => navigateToDocs(filename)}
            />

            <SourcesPanel
              sources={sources}
              open={sourcesOpen}
              onToggle={() => setSourcesOpen(!sourcesOpen)}
              onSelectSource={(src) => navigateToDocs(src)}
            />

            <ChunksPanel
              chunks={chunks}
              open={chunksOpen}
              onToggle={() => setChunksOpen(!chunksOpen)}
            />
          </>
        )}

        {view.page === "docs" && (
          <DocBrowser
            docList={docList}
            selectedDoc={view.selected}
            docContent={docContent}
            darkMode={darkMode}
            onSelectDoc={selectDoc}
          />
        )}
      </main>
    </div>
  );
}

export default App;
