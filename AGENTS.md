# AGENTS.md

## Project Overview
Mantis is a production-grade web platform for structured resume editing. The product vision is "Your AI Resume Agent," but this codebase starts with a controlled, local-first foundation rather than speculative automation.

The current implementation scope is:
- Dashboard for managing saved resumes
- Playground for editing and reviewing a single resume
- FastAPI backend scaffold for future services
- React frontend with modular components and persistent navigation

## Architecture
Mantis uses a two-surface product architecture:
- Dashboard: list, create, inspect, and manage resumes
- Playground: focused single-resume workspace for editing, previewing, and future assistant workflows

System boundaries:
- Frontend owns local interaction state, navigation, theming, and local draft persistence
- Backend owns API composition, service orchestration, deterministic business logic, and future integrations
- Shared contract shape must remain stable and JSON-first

## Core Rules
- Never regenerate an entire resume when only one section needs to change.
- All resume mutations must use structured JSON payloads.
- Prefer partial updates to specific sections or fields over whole-document rewrites.
- Preserve user-authored content unless an explicit update target is identified.

## AI Rules
- Keep prompts minimal and scoped to the exact section under edit.
- Send only the context required for the current task.
- Optimize token usage by avoiding repeated full-resume payloads.
- Maintain deterministic request shaping around any future AI calls.
- Do not ship AI features without observability and fallback behavior.

## ATS Rules
- ATS scoring must be deterministic and reproducible.
- Do not mix probabilistic model output directly into ATS scoring.
- Separate scoring inputs, scoring logic, and explanation output.
- Always make score derivation inspectable for debugging.

## Performance Rules
- Cache stable computations and reusable derived state where appropriate.
- Avoid unnecessary re-renders in the editor workspace.
- Prefer incremental updates over large payload synchronization.
- Keep frontend data access local-first unless server coordination is required.

## Security Rules
- Never store third-party API keys in localStorage, sessionStorage, or frontend source.
- Keep secrets on the server side only.
- Validate and sanitize all future upload and export paths.
- Treat resume content as sensitive user data.

## Frontend Rules
- Use section-based editing flows rather than full-document freeform mutation.
- Keep the sidebar persistent across major workspace pages.
- Preserve clear route boundaries between dashboard and playground concerns.
- Use green accents sparingly; base UI should remain dark, readable, and low-noise.
- Keep placeholder modules modular so future AI and ATS features can be slotted in without page rewrites.

## Backend Rules
- Use service-based architecture for business logic.
- Keep route handlers thin and orchestration-focused.
- Isolate models, services, routes, and utilities into separate modules.
- Favor explicit response contracts over implicit dictionary sprawl.
- Add new backend capabilities as composable services, not monolithic route files.
