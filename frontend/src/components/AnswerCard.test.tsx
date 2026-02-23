import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnswerCard from "./AnswerCard";

describe("AnswerCard", () => {
  const defaultProps = {
    submittedQuery: null,
    answer: null,
    error: null,
    darkMode: false,
    streaming: false,
    feedback: null as "up" | "down" | null,
    onFeedback: vi.fn(),
    onNavigateToDoc: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Question section", () => {
    it("does not render Question section when submittedQuery is null", () => {
      render(<AnswerCard {...defaultProps} />);
      expect(screen.queryByText("Question")).not.toBeInTheDocument();
    });

    it("renders the submitted question with a Question heading", () => {
      render(<AnswerCard {...defaultProps} submittedQuery="What is 42?" />);
      expect(screen.getByText("Question")).toBeInTheDocument();
      expect(screen.getByText("What is 42?")).toBeInTheDocument();
    });
  });

  describe("Error section", () => {
    it("does not render error when error is null", () => {
      render(<AnswerCard {...defaultProps} />);
      // No error-styled content should appear
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    });

    it("renders the error message", () => {
      render(<AnswerCard {...defaultProps} error="Something went wrong" />);
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });

  describe("Answer section", () => {
    it("does not render Answer section when answer is null", () => {
      render(<AnswerCard {...defaultProps} />);
      expect(screen.queryByText("Answer")).not.toBeInTheDocument();
    });

    it("renders the Answer heading when an answer is provided", () => {
      render(<AnswerCard {...defaultProps} answer="Plain answer text." />);
      expect(screen.getByText("Answer")).toBeInTheDocument();
    });

    it("renders markdown bold text in the answer", () => {
      render(<AnswerCard {...defaultProps} answer="The answer is **42**." />);
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  describe("Streaming cursor", () => {
    it("shows streaming cursor while streaming", () => {
      const { container } = render(
        <AnswerCard {...defaultProps} answer="Partial answer..." streaming={true} />
      );
      expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    });

    it("hides streaming cursor when not streaming", () => {
      const { container } = render(
        <AnswerCard {...defaultProps} answer="Complete answer." streaming={false} />
      );
      expect(container.querySelector("[aria-hidden='true']")).not.toBeInTheDocument();
    });
  });

  describe("Source reference links", () => {
    it("converts (Source: file.md) to a clickable button", () => {
      render(
        <AnswerCard
          {...defaultProps}
          answer="See (Source: guide.md) for details."
        />
      );
      expect(screen.getByRole("button", { name: "guide.md" })).toBeInTheDocument();
    });

    it("calls onNavigateToDoc with the filename when a source button is clicked", async () => {
      const onNavigateToDoc = vi.fn();
      render(
        <AnswerCard
          {...defaultProps}
          answer="See (Source: guide.md) for details."
          onNavigateToDoc={onNavigateToDoc}
        />
      );
      await userEvent.click(screen.getByRole("button", { name: "guide.md" }));
      expect(onNavigateToDoc).toHaveBeenCalledWith("guide.md");
    });

    it("renders plain anchor tags for non-doc hrefs", () => {
      render(
        <AnswerCard
          {...defaultProps}
          answer="Visit [example](https://example.com) here."
        />
      );
      expect(screen.getByRole("link", { name: "example" })).toBeInTheDocument();
    });
  });
});
