import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QueryInput from "./QueryInput";

describe("QueryInput", () => {
  const defaultProps = {
    query: "",
    onQueryChange: vi.fn(),
    onSubmit: vi.fn(),
    loading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the textarea with placeholder text", () => {
    render(<QueryInput {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Ask a question about internal docs...")
    ).toBeInTheDocument();
  });

  it("calls onQueryChange when user types", async () => {
    const onQueryChange = vi.fn();
    render(<QueryInput {...defaultProps} onQueryChange={onQueryChange} />);
    await userEvent.type(
      screen.getByPlaceholderText("Ask a question about internal docs..."),
      "hello"
    );
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("disables Ask button when query is empty", () => {
    render(<QueryInput {...defaultProps} query="" />);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("disables Ask button when query is only whitespace", () => {
    render(<QueryInput {...defaultProps} query="   " />);
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("enables Ask button when query has content", () => {
    render(<QueryInput {...defaultProps} query="test question" />);
    expect(screen.getByRole("button", { name: "Ask" })).not.toBeDisabled();
  });

  it("disables Ask button while loading", () => {
    render(<QueryInput {...defaultProps} query="test" loading={true} />);
    expect(screen.getByRole("button", { name: /asking/i })).toBeDisabled();
  });

  it("shows 'Asking...' text while loading", () => {
    render(<QueryInput {...defaultProps} query="test" loading={true} />);
    expect(screen.getByText("Asking...")).toBeInTheDocument();
  });

  it("calls onSubmit when Ask button is clicked", async () => {
    const onSubmit = vi.fn();
    render(<QueryInput {...defaultProps} query="test question" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("calls onSubmit when Enter is pressed in the textarea", async () => {
    const onSubmit = vi.fn();
    render(<QueryInput {...defaultProps} query="test" onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByPlaceholderText("Ask a question about internal docs..."),
      "{Enter}"
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not call onSubmit on Shift+Enter", async () => {
    const onSubmit = vi.fn();
    render(<QueryInput {...defaultProps} query="test" onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByPlaceholderText("Ask a question about internal docs..."),
      "{Shift>}{Enter}{/Shift}"
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not render Start Over button when showReset is omitted", () => {
    render(<QueryInput {...defaultProps} />);
    expect(screen.queryByText("Start Over")).not.toBeInTheDocument();
  });

  it("does not render Start Over button when showReset is false", () => {
    render(<QueryInput {...defaultProps} showReset={false} />);
    expect(screen.queryByText("Start Over")).not.toBeInTheDocument();
  });

  it("renders Start Over button when showReset is true", () => {
    render(<QueryInput {...defaultProps} showReset={true} onReset={vi.fn()} />);
    expect(screen.getByText("Start Over")).toBeInTheDocument();
  });

  it("calls onReset when Start Over is clicked", async () => {
    const onReset = vi.fn();
    render(<QueryInput {...defaultProps} showReset={true} onReset={onReset} />);
    await userEvent.click(screen.getByText("Start Over"));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
