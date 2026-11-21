# DocLens

DocLens is a Java documentation review app for the DeepSpace hiring exercise. It shows a method's implementation, original Javadoc, and available call context together. Signed-in reviewers can evaluate a comment, generate a repair, review the score changes and evidence, edit and re-evaluate the draft, and approve and copy a revision.

## Try it

- [Free public demo](https://doclens.app.space/#public-demo) — a saved evaluation and reviewed repair for a small Java method. The example uses manual behavioral review and deterministic checks. It requires no account or credits.
- [Method explorer](https://doclens.app.space/home) — browse 18 Apache Commons DbUtils methods, including overloaded methods, source, Javadocs, signatures, and extracted callers and callees.
- Sign in to evaluate a catalog method or add a private project by pasting a Java method or uploading an uncompressed CoCoMUT JSONL extract. Live evaluation and generation use the caller's DeepSpace credits. [Input formats and extraction walkthrough](DOC_LENS_INPUTS.md).

## Local setup

Use Node.js 22.15+ on the 22.x line, 24.x, or 26.x, and npm 11.6+. From the repository root run:

```sh
npm ci
npx playwright install chromium
npx deepspace auth login
npm run dev
```

Open the local URL printed by the CLI, normally <http://localhost:5173>. The CLI prepares the local Worker bindings. Keep local credentials in ignored files and use DeepSpace-managed credentials for deployment. This project uses its existing GitHub source connection. Commit and push reviewed changes before running `npm run deploy` from the project checkout.

## Architecture and DeepSpace integrations

| Layer | Responsibility |
| --- | --- |
| React, Vite, React Router | Prerendered public landing page, interactive catalog and signed-in evaluation and repair panels |
| Hono Worker on Cloudflare | Authenticated actions, validation, private project ownership checks, integration calls and error handling |
| DeepSpace Auth and RecordRoom | Bearer verification and reactive record queries over WebSocket. Catalog reads are public. Private projects, methods, evaluations and revisions are owner-scoped. Mutations run in authenticated application actions. |
| DeepSpace integrations | OpenAI GPT-4o-mini checks references and behavior and explains helpfulness. Cloudflare Jev applies the helpfulness rubric. Anthropic Claude Haiku drafts Javadoc. All three use the verified caller's credits. |

The app stores revisions with their source evaluation and parent revision so a reviewer can return to earlier results. Approval marks the selected revision. It preserves the original source and documentation. Integration requests send bounded code and Javadoc context to the relevant providers. Treat source submitted for live AI review according to your organization's data policy.

## Evaluation methodology

| Metric | Method |
| --- | --- |
| Completeness | Proportion of required local components with meaningful text, including the summary, parameters, return value, and declared exceptions where applicable |
| Helpfulness | Jev rating on a 1–5 scale using a Java adaptation of the DocAgent rubric for clarity, descriptive depth, parameter utility and guidance |
| Truthfulness | Reference checks against the signature, declarations, and extracted call targets. Missing context yields unresolved findings. |
| Behavioral correctness | Claim review against the method and available dependency snippets. A supported or contradicted finding needs a verbatim source quote. The percentage is the share of supported claims when all reported claims can be verified. |

For the final evaluation check, the focal method returns `value * 2` using Java `int` arithmetic. The correct comment documents the parameter, doubled return value and overflow semantics, yielding 100% completeness and a confirmed parameter. The incomplete comment correctly describes doubling but omits both tags, yielding 33% completeness. The incorrect comment claims tripling, uses the wrong parameter name and omits the return tag, yielding 33% completeness, an invalid parameter reference and a manually confirmed behavioral contradiction. Unit tests check the deterministic results and exercise evidence validation with controlled provider responses. [DocAgent methodology](https://aclanthology.org/2025.acl-demo.44/).

## Dataset and licensing

The bundled catalog contains 18 unchanged CoCoMUT schema 0.4.0 rows from its published Apache Commons DbUtils extraction. The DbUtils source revision is `a1034beb6ee791e3a7b2755af4d1d591162ec57f` and the CoCoMUT export is pinned at `59f6a79cc15e00b7741e5460d0dfc01c88215fc8`. Both upstream projects use Apache-2.0. The sample is a small, single-project subset selected to exercise method browsing and contextual review. The repo currently declares no separate distribution license for the DocLens application code.

- [Provenance, export links and citation](src/datasets/dbutils/PROVENANCE.txt)
- [Upstream Apache license](public/datasets/dbutils/LICENSE.txt) and [DbUtils notice](public/datasets/dbutils/NOTICE.txt)

## Verification

```sh
npm run type-check
npm run lint
npm run test:unit
npm test -- all
npm run build
```

Final local results were 16 unit tests and 16 browser/API tests passing, with type checking, lint and the production build passing. DeepSpace browser tests require Chromium. The two-account scenarios require two usable DeepSpace test accounts. Use `npx deepspace test accounts list` to discover existing accounts. Use zero-credit test accounts for the default integration failure-path checks. The suite covers public browsing, method persistence, private paste and upload, cross-account isolation, authentication, static demo discovery, and graceful evaluation and repair behavior when test accounts lack credits. The production review uses existing saved evaluations and revisions to verify the review and copy workflow without a fresh provider call. Fresh paid model accuracy on the three manual examples is outside the final check.

## Limitations and future improvements

Pasted methods use lightweight parsing. CoCoMUT uploads supply richer metadata, but static call graphs can miss runtime dispatch, external contracts, inherited documentation, and dependencies outside the uploaded set. AI scores vary and can be unavailable. Verbatim evidence anchors findings to source text, and a reviewer still needs to judge whether that evidence establishes the claim. The repair workflow changes Javadoc only. It does not compile or run Java.

Future work includes building a larger expert-labeled benchmark across projects, measuring calibration and agreement across model runs, resolving inherited documentation more reliably, and validating generated comments with Java tooling.
