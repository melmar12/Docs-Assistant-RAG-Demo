import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SourcesPanel from "./SourcesPanel";

describe("SourcesPanel", () => {
  const defaultProps = {
    sources: ["guide.md", "faq.md"],
    open: false,
    onToggle: vi.fn(),
    onSelectSource: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when sources array is empty", () => {
    const { container } = render(
      <SourcesPanel {...defaultProps} sources={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders source count in the panel header", () => {
    render(<SourcesPanel {...defaultProps} />);
    expect(screen.getByText("Sources (2)")).toBeInTheDocument();
  });

  it("renders correct count for a single source", () => {
    render(<SourcesPanel {...defaultProps} sources={["only.md"]} />);
    expect(screen.getByText("Sources (1)")).toBeInTheDocument();
  });

  describe("Collapsed state", () => {
    it("shows '+' toggle indicator when closed", () => {
      render(<SourcesPanel {...defaultProps} open={false} />);
      expect(screen.getByText("+")).toBeInTheDocument();
    });

    it("does not show source list when closed", () => {
      render(<SourcesPanel {...defaultProps} open={false} />);
      expect(screen.queryByText("guide.md")).not.toBeInTheDocument();
      expect(screen.queryByText("faq.md")).not.toBeInTheDocument();
    });
  });

  describe("Expanded state", () => {
    it("shows '−' toggle indicator when open", () => {
      render(<SourcesPanel {...defaultProps} open={true} />);
      expect(screen.getByText("−")).toBeInTheDocument();
    });

    it("lists all sources when open", () => {
      render(<SourcesPanel {...defaultProps} open={true} />);
      expect(screen.getByText("guide.md")).toBeInTheDocument();
      expect(screen.getByText("faq.md")).toBeInTheDocument();
    });
  });

  it("calls onToggle when the header button is clicked", async () => {
    const onToggle = vi.fn();
    render(<SourcesPanel {...defaultProps} onToggle={onToggle} />);
    await userEvent.click(screen.getByText("Sources (2)"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("calls onSelectSource with the filename when a source is clicked", async () => {
    const onSelectSource = vi.fn();
    render(
      <SourcesPanel {...defaultProps} open={true} onSelectSource={onSelectSource} />
    );
    await userEvent.click(screen.getByText("guide.md"));
    expect(onSelectSource).toHaveBeenCalledWith("guide.md");
  });
});
