import "@testing-library/jest-dom/vitest";

// Mock performance.getEntriesByType used by loadPersistedState
Object.defineProperty(globalThis.performance, "getEntriesByType", {
  value: () => [{ type: "navigate" }],
  writable: true,
});
