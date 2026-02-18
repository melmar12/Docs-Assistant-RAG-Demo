/**
 * Full-page documentation browser with a sidebar listing all
 * available docs and a content pane that renders the selected
 * document as Markdown. Strips YAML frontmatter before display.
 */

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdownComponents } from "../markdownConfig";
import { formatDocTitle, stripFrontmatter } from "../utils";

interface DocBrowserProps {
  docList: string[];
  selectedDoc: string | null;
  docContent: string | null | undefined;
  darkMode: boolean;
  onSelectDoc: (filename: string) => void;
}
export default function DocBrowser({ docList, selectedDoc, docContent, darkMode, onSelectDoc }: DocBrowserProps) {
  const markdownComponents = getMarkdownComponents(darkMode);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);

  function closeDrawer() {
    setDrawerClosing(true);
  }

  function handleMobileSelect(filename: string) {
    onSelectDoc(filename);
    closeDrawer();
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-[calc(100vh-8rem)]">
      {/* Mobile: edge tab to open drawer */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-vsc-surface border border-l-0 border-gray-200 dark:border-vsc-border text-purple-600 dark:text-vsc-accent px-1 py-3 rounded-r-lg shadow-sm text-sm"
      >
        ›
      </button>

      {/* Mobile: slide-in drawer + backdrop */}
      {(drawerOpen || drawerClosing) && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          onClick={closeDrawer}
        >
          <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${drawerClosing ? "opacity-0" : "opacity-100"}`} />
          <nav
            className={`relative w-72 max-w-[80vw] h-full bg-white dark:bg-vsc-surface shadow-xl overflow-y-auto ${drawerClosing ? "animate-[slideOut_0.2s_ease-in_forwards]" : "animate-[slideIn_0.2s_ease-out]"}`}
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={() => {
              if (drawerClosing) {
                setDrawerOpen(false);
                setDrawerClosing(false);
              }
            }}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-vsc-border">
              <h2 className="text-sm font-semibold text-purple-700 dark:text-vsc-accent uppercase tracking-wide">Documentation</h2>
              <button onClick={closeDrawer} className="p-1 text-gray-400 hover:text-gray-600 dark:text-vsc-text-muted dark:hover:text-vsc-text">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <ul>
              {docList.map((filename) => {
                const isSelected = selectedDoc === filename;
                return (
                  <li key={filename}>
                    <button
                      onClick={() => handleMobileSelect(filename)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${
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
          </nav>
        </div>
      )}

      {/* Desktop: full sidebar */}
      <aside className="hidden md:block w-64 shrink-0 bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg overflow-y-auto">
        <h2 className="text-sm font-semibold text-purple-700 dark:text-vsc-accent uppercase tracking-wide p-4 pb-2">Documentation</h2>
        <ul className="border-t border-gray-100 dark:border-vsc-border">
          {docList.map((filename) => {
            const isSelected = selectedDoc === filename;
            return (
              <li key={filename}>
                <button
                  onClick={() => onSelectDoc(filename)}
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
        {!selectedDoc ? (
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
  );
}
