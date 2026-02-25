import { type Mock, vi } from "vitest"
import type { OpenSeaClient } from "../src/client.js"

export type MockClient = {
  get: Mock
  post: Mock
}

export type CommandTestContext = {
  mockClient: MockClient
  getClient: () => OpenSeaClient
  getFormat: () => "json" | "table"
  consoleSpy: ReturnType<typeof vi.spyOn>
}

export function createCommandTestContext(): CommandTestContext {
  const mockClient: MockClient = {
    get: vi.fn(),
    post: vi.fn(),
  }
  const getClient = () => mockClient as unknown as OpenSeaClient
  const getFormat = () => "json" as "json" | "table"
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

  return { mockClient, getClient, getFormat, consoleSpy }
}

export function mockFetchResponse(data: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), { status }),
  )
}

export function mockFetchTextResponse(body: string, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { status }),
  )
}
