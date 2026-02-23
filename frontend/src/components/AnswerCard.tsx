/**
 * Displays the submitted question and the AI-generated answer.
 * Renders the answer as Markdown with syntax highlighting and
 * converts `(Source: file.md)` references into clickable links
 * that navigate to the doc browser.
 */

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getMarkdownComponents } from "../markdownConfig";

interface AnswerCardProps {
  submittedQuery: string | null;
  answer: string | null;
  error: string | null;
  darkMode: boolean;
  streaming: boolean;
  onNavigateToDoc: (filename: string) => void;
}
export default function AnswerCard({ submittedQuery, answer, error, darkMode, streaming, onNavigateToDoc }: AnswerCardProps) {
  const markdownComponents = getMarkdownComponents(darkMode);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!answer) return;
    navigator.clipboard.writeText(answer).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-vsc-text-muted uppercase tracking-wide">
              Answer
            </h2>
            <button
              onClick={handleCopy}
              disabled={streaming}
              className="text-xs text-gray-400 hover:text-gray-600 dark:text-vsc-text-muted dark:hover:text-vsc-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Copy answer to clipboard"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
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
                        onClick={() => onNavigateToDoc(docMatch[1])}
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
            {streaming && (
              <span
                className="inline-block w-0.5 h-4 bg-gray-700 dark:bg-vsc-text ml-0.5 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
