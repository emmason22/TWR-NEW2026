# Content Workflow

Use `content/site-content.json` as the source of truth for copy updates.

## Process
1. Update mission/program/event copy in `content/site-content.json`.
2. Apply updates to page templates (`index.html`, program pages).
3. Run preflight: `node scripts/preflight-check.mjs`.
4. Validate pages locally and deploy.

## Guardrails
- Keep one `<h1>` per page.
- Keep response-time statements accurate and dated.
- Keep partner links and addresses current.
