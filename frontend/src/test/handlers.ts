import { http, HttpResponse } from "msw";

const API_URL = "http://localhost:8000";

export const queryResponse = {
  answer: "The answer is **42**.",
  sources: ["guide.md", "faq.md"],
  chunks: [
    { doc_id: "guide.md::0", score: 0.95, text: "Chunk text from guide" },
    { doc_id: "faq.md::1", score: 0.88, text: "Chunk text from faq" },
  ],
};

export const docList = ["getting-started.md", "api-reference.md"];

export const docContent = {
  filename: "getting-started.md",
  content: "---\ntitle: Getting Started\n---\n# Getting Started\n\nWelcome to the docs.",
};

export const handlers = [
  http.post(`${API_URL}/query`, () => {
    return HttpResponse.json(queryResponse);
  }),

  http.get(`${API_URL}/api/docs`, () => {
    return HttpResponse.json(docList);
  }),

  http.get(`${API_URL}/api/docs/:filename`, () => {
    return HttpResponse.json(docContent);
  }),
];
