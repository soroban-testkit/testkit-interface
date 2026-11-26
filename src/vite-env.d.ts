/// <reference types="vite/client" />
/// <reference types="vitest/config" />

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
}
