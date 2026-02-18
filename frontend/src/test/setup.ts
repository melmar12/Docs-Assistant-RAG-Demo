import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock performance.getEntriesByType used by loadPersistedState
Object.defineProperty(globalThis.performance, "getEntriesByType", {
  value: () => [{ type: "navigate" }],
  writable: true,
});
