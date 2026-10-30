# Repository Instructions

The project-wide instructions in `/Users/zhaoyan/Documents/Project/AGENTS.md` apply.

## Public/private boundary

- Treat `../private-assets/` as local-only and read-only source material.
- Never stage restricted maps, raw VDB/HDRI caches, credentials, generated PDFs, videos or Blend files without a completed redistribution review.
- Every committed third-party asset must have an entry in `assets/manifest.json`.

## Worktrees

- `main` is the integration worktree.
- Use one task branch and one sibling worktree per experiment or bounded fix.
- Write generated outputs to the task worktree's `.cache/`, never to shared private source assets.

