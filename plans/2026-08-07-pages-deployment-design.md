# GitHub Pages deployment design

## Goal

Make one workflow responsible for both validation and deployment so a failing commit cannot reach GitHub Pages, while newer pushes cancel obsolete runs instead of forming a queue.

## Design

- Keep `.github/workflows/ci.yml` as the single workflow for pushes, pull requests, and manual runs.
- Run syntax checks, tests, a fresh build, and the committed-output check before creating the Pages artifact.
- Upload the Pages artifact only for non-pull-request runs.
- Make deployment depend on the successful validation job and restrict it to `main`.
- Use workflow-and-ref concurrency with `cancel-in-progress: true`, so unrelated pull requests remain independent and only older runs for the same ref are canceled.
- Remove the standalone Pages workflow to eliminate duplicate deployments.

## Verification

- Parse the remaining workflow YAML after the edit and confirm only one Pages deploy action remains.
- Run `npm run check` and `npm run build` locally.
- Confirm `git diff --exit-code -- docs` succeeds.
- Push the change and verify the combined GitHub Actions run completes successfully.
- Confirm the Pages API reports a healthy status and the live site serves the expected commit.
