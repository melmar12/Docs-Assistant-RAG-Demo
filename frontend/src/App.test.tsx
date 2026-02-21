import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { queryResponse } from "./test/handlers";
import { server } from "./test/server";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("App", () => {
  describe("Header and navigation", () => {
    it("renders header with title and Browse Docs link", () => {
      render(<App />);
      expect(screen.getByText("Docs Assistant")).toBeInTheDocument();
      expect(screen.getByText("Browse Docs")).toBeInTheDocument();
    });

    it("navigates to docs view when Browse Docs is clicked", async () => {
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Documentation")).toBeInTheDocument();
      });
      expect(screen.getByText("Back to Assistant")).toBeInTheDocument();
    });

    it("returns to home view when Back to Assistant is clicked", async () => {
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
      const { container } = render(<App />);
      expect(container.firstElementChild).toHaveClass("dark");
    });

    it("toggles to light mode on click", async () => {
      const { container } = render(<App />);
      const toggle = screen.getByLabelText("Switch to light mode");

      await userEvent.click(toggle);

      expect(container.firstElementChild).not.toHaveClass("dark");
      expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
    });

    it("persists theme preference to localStorage", async () => {
      render(<App />);
      const toggle = screen.getByLabelText("Switch to light mode");

      await userEvent.click(toggle);

      expect(localStorage.getItem("docs-assistant-theme")).toBe("light");
    });
  });

  describe("Query input", () => {
    it("accepts text input in textarea", async () => {
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "How do I deploy?");

      expect(textarea).toHaveValue("How do I deploy?");
    });

    it("disables Ask button when textarea is empty", () => {
      render(<App />);
      expect(screen.getByText("Ask")).toBeDisabled();
    });

    it("submits query on Enter key", async () => {
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test query");
      await userEvent.keyboard("{Enter}");

      await waitFor(() => {
        expect(screen.getByText("Answer")).toBeInTheDocument();
      });
    });

    it("does not submit on Shift+Enter", async () => {
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test query");
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");

      expect(screen.queryByText("Answer")).not.toBeInTheDocument();
    });

    it("shows spinner and disables button while query is in flight", async () => {
      let resolveRequest!: (r: Response) => void;
      server.use(
        http.post("http://localhost:8000/query", () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          })
        )
      );

      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");
      await userEvent.type(textarea, "test query");

      // don't await — request stays in flight until we resolve it
      userEvent.click(screen.getByText("Ask"));

      await waitFor(() => expect(screen.getByText("Asking...")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /asking/i })).toBeDisabled();

      resolveRequest(HttpResponse.json(queryResponse) as unknown as Response);
      await waitFor(() => expect(screen.getByText("Answer")).toBeInTheDocument());
    });
  });

  describe("Query results", () => {
    it("displays answer and question after successful query", async () => {
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
      server.use(
        http.post("http://localhost:8000/query", () => {
          return new HttpResponse(null, { status: 500 });
        })
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
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "my question");
      await userEvent.click(screen.getByText("Ask"));

      expect(textarea).toHaveValue("");
    });
  });

  describe("Sources and chunks sections", () => {
    async function submitQuery() {
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
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Getting Started")).toBeInTheDocument();
        expect(screen.getByText("Api Reference")).toBeInTheDocument();
      });
    });

    it("loads and renders doc content when selected", async () => {
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
      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Select a document to view.")).toBeInTheDocument();
      });
    });
  });

  describe("Welcome card and Start Over", () => {
    it("shows welcome card with scenario text on initial load", () => {
      render(<App />);
      expect(screen.getByText(/You're a new engineer/)).toBeInTheDocument();
    });

    it("shows suggestion chips that fill the query input", async () => {
      render(<App />);
      const chip = screen.getByText("What should I do during my first week?");

      await userEvent.click(chip);

      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");
      expect(textarea).toHaveValue("What should I do during my first week?");
    });

    it("hides welcome card after a query is submitted", async () => {
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test");
      await userEvent.click(screen.getByText("Ask"));

      await waitFor(() => {
        expect(screen.getByText("Answer")).toBeInTheDocument();
      });
      expect(screen.queryByText(/You're a new engineer/)).not.toBeInTheDocument();
    });

    it("does not show Start Over button before a query", () => {
      render(<App />);
      expect(screen.queryByText("Start Over")).not.toBeInTheDocument();
    });

    it("shows Start Over button after a query and resets to welcome card", async () => {
      render(<App />);
      const textarea = screen.getByPlaceholderText("Ask a question about internal docs...");

      await userEvent.type(textarea, "test");
      await userEvent.click(screen.getByText("Ask"));

      await waitFor(() => {
        expect(screen.getByText("Start Over")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Start Over"));

      expect(screen.getByText(/You're a new engineer/)).toBeInTheDocument();
      expect(screen.queryByText("Start Over")).not.toBeInTheDocument();
    });
  });

  describe("Utility functions", () => {
    it("formatDocTitle converts filename to title case", async () => {
      server.use(
        http.get("http://localhost:8000/api/docs", () => {
          return HttpResponse.json(["some-doc_file.md"]);
        })
      );

      render(<App />);

      await userEvent.click(screen.getByText("Browse Docs"));

      await waitFor(() => {
        expect(screen.getByText("Some Doc File")).toBeInTheDocument();
      });
    });
  });
});
