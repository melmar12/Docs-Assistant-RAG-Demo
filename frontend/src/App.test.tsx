import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn((url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        });
      }
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

const queryResponse = {
  answer: "The answer is **42**.",
  sources: ["guide.md", "faq.md"],
  chunks: [
    { doc_id: "guide.md::0", score: 0.95, text: "Chunk text from guide" },
    { doc_id: "faq.md::1", score: 0.88, text: "Chunk text from faq" },
  ],
};

const docList = ["getting-started.md", "api-reference.md"];

const docContent = {
  filename: "getting-started.md",
  content: "---\ntitle: Getting Started\n---\n# Getting Started\n\nWelcome to the docs.",
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("App", () => {
  describe("Header and navigation", () => {
    it("renders header with title and Browse Docs link", () => {
      globalThis.fetch = mockFetch({});
      render(<App />);
      expect(screen.getByText("Docs Assistant")).toBeInTheDocument();
      expect(screen.getByText("Browse Docs")).toBeInTheDocument();
    });

    it("navigates to docs view when Browse Docs is clicked", async () => {
      globalThis.fetch = mockFetch({ "/api/docs": docList });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Documentation")).toBeInTheDocument();
      });
      expect(screen.getByText("Back to Assistant")).toBeInTheDocument();
    });

    it("returns to home view when Back to Assistant is clicked", async () => {
      globalThis.fetch = mockFetch({ "/api/docs": docList });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));
      await waitFor(() => {
        expect(screen.getByText("Back to Assistant")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Back to Assistant"));
      expect(screen.getByText("Browse Docs")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Ask a question about internal docs...")).toBeInTheDocument();
    });
  });

  describe("Dark/light mode", () => {
    it("defaults to dark mode", () => {
      globalThis.fetch = mockFetch({});
      const { container } = render(<App />);
      expect(container.firstElementChild).toHaveClass("dark");
    });

    it("toggles to light mode on click", async () => {
      globalThis.fetch = mockFetch({});
      const { container } = render(<App />);
      const toggle = screen.getByLabelText("Switch to light mode");

      await userEvent.click(toggle);

      expect(container.firstElementChild).not.toHaveClass("dark");
      expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
    });

    it("persists theme preference to localStorage", async () => {
      globalThis.fetch = mockFetch({});
      render(<App />);
      const toggle = screen.getByLabelText("Switch to light mode");

      await userEvent.click(toggle);

      expect(localStorage.getItem("docs-assistant-theme")).toBe("light");
    });
  });

  describe("Query input", () => {
    it("accepts text input in textarea", async () => {
      globalThis.fetch = mockFetch({});
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "How do I deploy?");

      expect(textarea).toHaveValue("How do I deploy?");
    });

    it("disables Ask button when textarea is empty", () => {
      globalThis.fetch = mockFetch({});
      render(<App />);
      expect(screen.getByText("Ask")).toBeDisabled();
    });

    it("submits query on Enter key", async () => {
      const fetchMock = mockFetch({ "/query": queryResponse });
      globalThis.fetch = fetchMock;
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test query");
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "http://localhost:8000/query",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ query: "test query", top_k: 5 }),
          })
        );
      });
    });

    it("does not submit on Shift+Enter", async () => {
      const fetchMock = mockFetch({});
      globalThis.fetch = fetchMock;
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test query");
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Query results", () => {
    it("displays answer and question after successful query", async () => {
      globalThis.fetch = mockFetch({ "/query": queryResponse });
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "What is the answer?");
      await userEvent.click(screen.getByText("Ask"));

      await waitFor(() => {
        expect(screen.getByText("What is the answer?")).toBeInTheDocument();
      });
      expect(screen.getByText("Answer")).toBeInTheDocument();
    });

    it("displays error on failed query", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve({ ok: false, status: 500 })
      );
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "bad query");
      await userEvent.click(screen.getByText("Ask"));

      await waitFor(() => {
        expect(screen.getByText("Request failed (500)")).toBeInTheDocument();
      });
    });

    it("clears textarea after submission", async () => {
      globalThis.fetch = mockFetch({ "/query": queryResponse });
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "my question");
      await userEvent.click(screen.getByText("Ask"));

      expect(textarea).toHaveValue("");
    });
  });

  describe("Sources and chunks sections", () => {
    async function submitQuery() {
      globalThis.fetch = mockFetch({ "/query": queryResponse });
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");
      await userEvent.type(textarea, "test");
      await userEvent.click(screen.getByText("Ask"));
      await waitFor(() => {
        expect(screen.getByText("Answer")).toBeInTheDocument();
      });
    }

    it("shows sources section that expands on click", async () => {
      await submitQuery();

      const sourcesBtn = screen.getByText("Sources (2)");
      expect(sourcesBtn).toBeInTheDocument();

      await userEvent.click(sourcesBtn);

      expect(screen.getByText("guide.md")).toBeInTheDocument();
      expect(screen.getByText("faq.md")).toBeInTheDocument();
    });

    it("shows chunks section that expands on click", async () => {
      await submitQuery();

      const chunksBtn = screen.getByText("Retrieved Chunks (2)");
      expect(chunksBtn).toBeInTheDocument();

      await userEvent.click(chunksBtn);

      expect(screen.getByText("guide.md::0")).toBeInTheDocument();
      expect(screen.getByText("0.9500")).toBeInTheDocument();
    });
  });

  describe("Doc browsing", () => {
    it("renders doc list in sidebar", async () => {
      globalThis.fetch = mockFetch({ "/api/docs": docList });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Getting Started")).toBeInTheDocument();
        expect(screen.getByText("Api Reference")).toBeInTheDocument();
      });
    });

    it("loads and renders doc content when selected", async () => {
      globalThis.fetch = mockFetch({
        "/api/docs/getting": docContent,
        "/api/docs": docList,
      });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));
      await waitFor(() => {
        expect(screen.getByText("Getting Started")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Getting Started"));

      await waitFor(() => {
        expect(screen.getByText("Welcome to the docs.")).toBeInTheDocument();
      });
    });

    it("strips YAML frontmatter from doc content", async () => {
      globalThis.fetch = mockFetch({
        "/api/docs/getting": docContent,
        "/api/docs": docList,
      });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));
      await waitFor(() => {
        expect(screen.getByText("Getting Started")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Getting Started"));

      await waitFor(() => {
        expect(screen.getByText("Welcome to the docs.")).toBeInTheDocument();
      });
      expect(screen.queryByText("title: Getting Started")).not.toBeInTheDocument();
    });

    it("shows placeholder when no doc selected", async () => {
      globalThis.fetch = mockFetch({ "/api/docs": docList });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Select a document to view.")).toBeInTheDocument();
      });
    });
  });

  describe("Utility functions", () => {
    it("formatDocTitle converts filename to title case", async () => {
      globalThis.fetch = mockFetch({ "/api/docs": ["some-doc_file.md"] });
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Some Doc File")).toBeInTheDocument();
      });
    });
  });
});
