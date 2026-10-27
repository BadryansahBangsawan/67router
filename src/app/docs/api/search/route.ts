import { createFromSource } from "fumadocs-core/search/server";

// The docs source holds every compiled docs page; load it on the first search
// instead of at server start (see tests/unit/docs-source-lazy-import.test.ts).
let searchApi: Promise<ReturnType<typeof createFromSource>> | null = null;

export async function GET(request: Request) {
  searchApi ??= import("@/lib/source").then(({ source }) => createFromSource(source));
  return (await searchApi).GET(request);
}
