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

  return (
    <div className="flex gap-6 min-h-[calc(100vh-8rem)]">
      <aside className="w-64 shrink-0 bg-white dark:bg-vsc-surface border border-gray-200 dark:border-vsc-border rounded-lg overflow-y-auto">
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
