export function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n/, "").trimStart();
}

export function formatDocTitle(filename: string) {
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
