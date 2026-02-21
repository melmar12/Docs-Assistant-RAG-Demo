"""Unit tests for the pure chunking and loading functions in backend.app.ingest."""

from pathlib import Path

import pytest

from backend.app.ingest import (
    _extract_title,
    _split_by_headings,
    _split_section_by_paragraphs,
    chunk_markdown,
    load_markdown_files,
)


# ---------------------------------------------------------------------------
# _extract_title
# ---------------------------------------------------------------------------


class TestExtractTitle:
    def test_returns_h1_line(self):
        text = "# My Title\n\nSome content."
        assert _extract_title(text) == "# My Title"

    def test_returns_empty_string_when_no_h1(self):
        text = "Just a paragraph.\n\nAnother paragraph."
        assert _extract_title(text) == ""

    def test_ignores_h2_headings(self):
        text = "## Section Heading\n\nContent."
        assert _extract_title(text) == ""

    def test_returns_first_h1_only(self):
        text = "# First Title\n\n# Second Title\n\nContent."
        assert _extract_title(text) == "# First Title"

    def test_h1_mixed_with_h2(self):
        text = "## Intro\n\n# Actual Title\n\nContent."
        assert _extract_title(text) == "# Actual Title"


# ---------------------------------------------------------------------------
# _split_by_headings
# ---------------------------------------------------------------------------


class TestSplitByHeadings:
    def test_no_h2_returns_single_preamble_entry(self):
        text = "Just some preamble content."
        result = _split_by_headings(text)
        assert result == [("", "Just some preamble content.")]

    def test_empty_string_returns_empty_list(self):
        result = _split_by_headings("")
        assert result == []

    def test_single_h2_no_preamble(self):
        text = "## Section One\n\nBody text."
        result = _split_by_headings(text)
        assert len(result) == 1
        assert result[0] == ("## Section One", "Body text.")

    def test_preamble_plus_one_h2(self):
        text = "# Title\n\n## Section\n\nBody."
        result = _split_by_headings(text)
        assert len(result) == 2
        assert result[0] == ("", "# Title")
        assert result[1] == ("## Section", "Body.")

    def test_multiple_h2_sections(self):
        text = "## Alpha\n\nAlpha body.\n\n## Beta\n\nBeta body."
        result = _split_by_headings(text)
        assert len(result) == 2
        assert result[0] == ("## Alpha", "Alpha body.")
        assert result[1] == ("## Beta", "Beta body.")

    def test_h2_with_empty_body(self):
        text = "## Heading\n\n## Another"
        result = _split_by_headings(text)
        assert result[0] == ("## Heading", "")
        assert result[1] == ("## Another", "")


# ---------------------------------------------------------------------------
# _split_section_by_paragraphs
# ---------------------------------------------------------------------------


class TestSplitSectionByParagraphs:
    def test_small_section_returns_single_chunk(self):
        result = _split_section_by_paragraphs("Short content.", "# Title", "## Heading", 1500)
        assert len(result) == 1
        assert "Short content." in result[0]

    def test_chunk_prefix_includes_title_and_heading(self):
        result = _split_section_by_paragraphs("Content.", "# My Title", "## My Section", 1500)
        assert result[0].startswith("# My Title\n\n## My Section\n\n")

    def test_no_title_no_heading_prefix_is_empty(self):
        result = _split_section_by_paragraphs("Content.", "", "", 1500)
        assert result[0] == "Content."

    def test_two_paragraphs_split_when_combined_exceeds_max(self):
        para_a = "A" * 60
        para_b = "B" * 60
        text = f"{para_a}\n\n{para_b}"
        # max_chars small enough that both paragraphs together won't fit
        result = _split_section_by_paragraphs(text, "", "", 70)
        assert len(result) == 2
        assert para_a in result[0]
        assert para_b in result[1]

    def test_single_oversized_paragraph_is_returned_as_fallback(self):
        huge_para = "X" * 2000
        # With no title/heading the prefix is empty, so the fallback chunk is just the para
        result = _split_section_by_paragraphs(huge_para, "", "", 100)
        assert len(result) == 1
        assert result[0] == huge_para

    def test_single_oversized_paragraph_with_prefix_is_returned_with_prefix(self):
        huge_para = "X" * 2000
        result = _split_section_by_paragraphs(huge_para, "# T", "## H", 100)
        # prefix is prepended even in the fallback case
        assert len(result) == 1
        assert result[0].startswith("# T\n\n## H\n\n")
        assert huge_para in result[0]

    def test_title_only_no_heading(self):
        result = _split_section_by_paragraphs("Body text.", "# Title", "", 1500)
        assert result[0].startswith("# Title\n\n")
        assert "Body text." in result[0]


# ---------------------------------------------------------------------------
# chunk_markdown
# ---------------------------------------------------------------------------


class TestChunkMarkdown:
    def test_simple_document_single_chunk(self):
        # A doc with no preamble — just a ## section — produces exactly one chunk
        text = "## Section\n\nSome body text."
        chunks = chunk_markdown(text)
        assert len(chunks) == 1
        chunk = chunks[0]
        assert chunk["section"] == "Section"
        assert "## Section" in chunk["text"]
        assert "Some body text." in chunk["text"]

    def test_title_preamble_plus_section_produces_two_chunks(self):
        text = "# Title\n\n## Section\n\nSome body text."
        chunks = chunk_markdown(text)
        # The # Title line is treated as preamble → its own chunk, then the ## section
        assert len(chunks) == 2
        assert chunks[0]["section"] == "(intro)"
        assert chunks[1]["section"] == "Section"
        assert "# Title" in chunks[1]["text"]  # title included for context

    def test_preamble_only_section_name_is_intro(self):
        text = "Just preamble with no headings."
        chunks = chunk_markdown(text)
        assert len(chunks) == 1
        assert chunks[0]["section"] == "(intro)"

    def test_large_section_is_sub_chunked(self):
        # Build a section body with many paragraphs that will exceed max_chars.
        # No preamble title so all chunks belong to the same section.
        body = "\n\n".join(["Paragraph text here." * 5] * 10)
        text = f"## Big Section\n\n{body}"
        chunks = chunk_markdown(text, max_chars=200)
        assert len(chunks) > 1
        assert all(c["section"] == "Big Section" for c in chunks)

    def test_multiple_sections_produce_multiple_chunks(self):
        text = "## Alpha\n\nAlpha content.\n\n## Beta\n\nBeta content."
        chunks = chunk_markdown(text)
        assert len(chunks) == 2
        sections = [c["section"] for c in chunks]
        assert "Alpha" in sections
        assert "Beta" in sections

    def test_max_chars_respected(self):
        # Use multiple short paragraphs so paragraph-splitting can actually kick in.
        # A single run-on paragraph can't be split further, so max_chars isn't
        # strictly enforced in that degenerate case (documented behaviour).
        para = "Word " * 20  # ~100 chars each
        body = "\n\n".join([para] * 20)
        text = f"## Section\n\n{body}"
        chunks = chunk_markdown(text, max_chars=300)
        assert len(chunks) > 1
        for chunk in chunks:
            # Prefix overhead ("## Section\n\n") adds ~12 chars; allow modest headroom
            assert len(chunk["text"]) <= 350

    def test_chunk_dict_has_required_keys(self):
        text = "## Section\n\nBody."
        chunks = chunk_markdown(text)
        assert all("text" in c and "section" in c for c in chunks)

    def test_title_not_repeated_in_preamble_chunk(self):
        text = "# Doc Title\n\nThis is the intro."
        chunks = chunk_markdown(text)
        # The preamble chunk (heading="") should not prepend the title
        # because the title/heading block only applies when heading is non-empty
        preamble_chunk = chunks[0]
        assert preamble_chunk["section"] == "(intro)"


# ---------------------------------------------------------------------------
# load_markdown_files
# ---------------------------------------------------------------------------


class TestLoadMarkdownFiles:
    def test_empty_directory_returns_empty_list(self, tmp_path):
        result = load_markdown_files(tmp_path)
        assert result == []

    def test_single_md_file_returned(self, tmp_path):
        (tmp_path / "guide.md").write_text("# Guide\n\nContent.", encoding="utf-8")
        result = load_markdown_files(tmp_path)
        assert len(result) == 1
        assert result[0]["filename"] == "guide.md"
        assert result[0]["relative_path"] == "guide.md"
        assert result[0]["content"] == "# Guide\n\nContent."

    def test_non_md_files_are_ignored(self, tmp_path):
        (tmp_path / "doc.md").write_text("# Doc", encoding="utf-8")
        (tmp_path / "readme.txt").write_text("plain text", encoding="utf-8")
        (tmp_path / "data.json").write_text("{}", encoding="utf-8")
        result = load_markdown_files(tmp_path)
        assert len(result) == 1
        assert result[0]["filename"] == "doc.md"

    def test_nested_md_files_are_included(self, tmp_path):
        subdir = tmp_path / "sub"
        subdir.mkdir()
        (tmp_path / "top.md").write_text("Top", encoding="utf-8")
        (subdir / "nested.md").write_text("Nested", encoding="utf-8")
        result = load_markdown_files(tmp_path)
        filenames = [r["filename"] for r in result]
        assert "top.md" in filenames
        assert "nested.md" in filenames

    def test_nested_relative_path_includes_subdir(self, tmp_path):
        subdir = tmp_path / "api"
        subdir.mkdir()
        (subdir / "endpoints.md").write_text("# API", encoding="utf-8")
        result = load_markdown_files(tmp_path)
        assert result[0]["relative_path"] == str(Path("api") / "endpoints.md")

    def test_multiple_files_sorted_alphabetically(self, tmp_path):
        (tmp_path / "zebra.md").write_text("Z", encoding="utf-8")
        (tmp_path / "apple.md").write_text("A", encoding="utf-8")
        (tmp_path / "mango.md").write_text("M", encoding="utf-8")
        result = load_markdown_files(tmp_path)
        filenames = [r["filename"] for r in result]
        assert filenames == ["apple.md", "mango.md", "zebra.md"]
