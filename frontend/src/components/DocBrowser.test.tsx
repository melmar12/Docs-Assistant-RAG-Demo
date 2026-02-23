import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocBrowser from "./DocBrowser";

const docList = ["getting-started.md", "api-reference.md"];

describe("DocBrowser", () => {
  const defaultProps = {
    docList,
    selectedDoc: null,
    docContent: null,
    darkMode: false,
    onSelectDoc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Content pane states", () => {
    it("shows placeholder text when no document is selected", () => {
      render(<DocBrowser {...defaultProps} />);
      expect(screen.getByText("Select a document to view.")).toBeInTheDocument();
    });

    it("shows loading text when a doc is selected but content is undefined", () => {
      render(
        <DocBrowser
          {...defaultProps}
          selectedDoc="getting-started.md"
          docContent={undefined}
        />
      );
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("shows error text when a doc is selected but content is null", () => {
      render(
        <DocBrowser
          {...defaultProps}
          selectedDoc="getting-started.md"
          docContent={null}
        />
      );
      expect(screen.getByText("Failed to load document.")).toBeInTheDocument();
    });

    it("renders document markdown content when provided", () => {
      render(
        <DocBrowser
          {...defaultProps}
          selectedDoc="getting-started.md"
          docContent={"# Getting Started\n\nWelcome to the docs."}
        />
      );
      expect(screen.getByText("Welcome to the docs.")).toBeInTheDocument();
    });

    it("strips YAML frontmatter before rendering content", () => {
      render(
        <DocBrowser
          {...defaultProps}
          selectedDoc="getting-started.md"
          docContent={"---\ntitle: Getting Started\n---\n# Getting Started\n\nWelcome."}
        />
      );
      expect(screen.queryByText("title: Getting Started")).not.toBeInTheDocument();
      expect(screen.getByText("Welcome.")).toBeInTheDocument();
    });
  });

  describe("Desktop sidebar", () => {
    it("shows Documentation heading in the sidebar", () => {
      render(<DocBrowser {...defaultProps} />);
      expect(screen.getByText("Documentation")).toBeInTheDocument();
    });

    it("lists all docs with formatted titles", () => {
      render(<DocBrowser {...defaultProps} />);
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
      expect(screen.getByText("Api Reference")).toBeInTheDocument();
    });

    it("calls onSelectDoc with the filename when a doc is clicked", async () => {
      const onSelectDoc = vi.fn();
      render(<DocBrowser {...defaultProps} onSelectDoc={onSelectDoc} />);
      await userEvent.click(screen.getByText("Getting Started"));
      expect(onSelectDoc).toHaveBeenCalledWith("getting-started.md");
    });
  });

  describe("Mobile drawer", () => {
    it("opens the drawer when the edge tab is clicked", async () => {
      render(<DocBrowser {...defaultProps} />);
      // The edge tab button contains "›"
      await userEvent.click(screen.getByText("›"));
      // The drawer header "Documentation" should now be visible (in addition to desktop sidebar)
      expect(screen.getAllByText("Documentation").length).toBeGreaterThan(1);
    });

    it("calls onSelectDoc when a doc is selected from the mobile drawer", async () => {
      const onSelectDoc = vi.fn();
      render(<DocBrowser {...defaultProps} onSelectDoc={onSelectDoc} />);
      await userEvent.click(screen.getByText("›"));
      // Both desktop sidebar and mobile drawer now have "Getting Started"
      const buttons = screen.getAllByText("Getting Started");
      // Click the last one (in the mobile drawer)
      await userEvent.click(buttons[buttons.length - 1]);
      expect(onSelectDoc).toHaveBeenCalledWith("getting-started.md");
    });
  });
});
