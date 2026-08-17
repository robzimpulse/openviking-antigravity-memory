# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-08-17

### Added
- Native Antigravity 2.0 plugin integration for OpenViking memory.
- `PreInvocation` lifecycle hook: automatic memory recall before model turn with per-turn hash deduplication.
- `Stop` lifecycle hook: non-blocking fast exit (<500ms) with detached background worker for transcript parsing and message batching.
- Model Context Protocol (MCP) proxy: stdio-to-HTTP gateway for `search`, `read`, `find`, `remember`, and experience tools.
- Periodic session distillation policy (20k token threshold + 30-minute idle session sweep).
- Local offline resilient pending queue (`pending-queue.mjs`) with automatic replay.
- Idempotent automated installer (`install.sh` / `install.mjs`) and uninstaller (`uninstall.sh`).
- Comprehensive diagnostic and maintenance CLI (`scripts/manage.mjs`).
- Complete unit, integration, and identity-isolation test suite.
