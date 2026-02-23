import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChunksPanel from "./ChunksPanel";

const chunks = [
  { doc_id: "guide.md::0", score: 0.95, text: "Chunk text from guide" },
  { doc_id: "faq.md::1", score: 0.8812, text: "Chunk text from faq" },
];

describe("ChunksPanel", () => {
  const defaultProps = {
    chunks,
    open: false,
    onToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when chunks array is empty", () => {
    const { container } = render(<ChunksPanel {...defaultProps} chunks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders chunk count in the panel header", () => {
    render(<ChunksPanel {...defaultProps} />);
    expect(screen.getByText("Retrieved Chunks (2)")).toBeInTheDocument();
  });

  it("renders correct count for a single chunk", () => {
    render(<ChunksPanel {...defaultProps} chunks={[chunks[0]]} />);
    expect(screen.getByText("Retrieved Chunks (1)")).toBeInTheDocument();
  });

  describe("Collapsed state", () => {
    it("shows '+' toggle indicator when closed", () => {
      render(<ChunksPanel {...defaultProps} open={false} />);
      expect(screen.getByText("+")).toBeInTheDocument();
    });

    it("does not show chunk content when closed", () => {
      render(<ChunksPanel {...defaultProps} open={false} />);
      expect(screen.queryByText("guide.md::0")).not.toBeInTheDocument();
      expect(screen.queryByText("Chunk text from guide")).not.toBeInTheDocument();
    });
  });

  describe("Expanded state", () => {
    it("shows '−' toggle indicator when open", () => {
      render(<ChunksPanel {...defaultProps} open={true} />);
      expect(screen.getByText("−")).toBeInTheDocument();
    });

    it("shows doc_ids for all chunks when open", () => {
      render(<ChunksPanel {...defaultProps} open={true} />);
      expect(screen.getByText("guide.md::0")).toBeInTheDocument();
      expect(screen.getByText("faq.md::1")).toBeInTheDocument();
    });

    it("formats similarity scores to 4 decimal places", () => {
      render(<ChunksPanel {...defaultProps} open={true} />);
      expect(screen.getByText("0.9500")).toBeInTheDocument();
      expect(screen.getByText("0.8812")).toBeInTheDocument();
    });

    it("shows chunk text for all chunks when open", () => {
      render(<ChunksPanel {...defaultProps} open={true} />);
      expect(screen.getByText("Chunk text from guide")).toBeInTheDocument();
      expect(screen.getByText("Chunk text from faq")).toBeInTheDocument();
    });
  });

  it("calls onToggle when the header button is clicked", async () => {
    const onToggle = vi.fn();
    render(<ChunksPanel {...defaultProps} onToggle={onToggle} />);
    await userEvent.click(screen.getByText("Retrieved Chunks (2)"));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
