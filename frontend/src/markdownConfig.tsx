import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

export function getMarkdownComponents(darkMode: boolean): Components {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
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
}
