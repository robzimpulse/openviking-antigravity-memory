# Contributing to OpenViking Antigravity Plugin

Thank you for your interest in contributing! We welcome bug reports, feature suggestions, documentation improvements, and pull requests.

## How to Contribute

1. **Fork the Repository**: Create your own fork and clone it locally.
2. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/my-new-feature
   ```
3. **Run Tests**: Ensure all unit and integration tests pass before submitting changes:
   ```bash
   node --test test/unit/*.test.mjs
   ```
4. **Adhere to Code Guidelines**:
   - Keep dependencies zero-install (use Node.js standard library `node:*`).
   - Never log or leak credentials, tokens, or API keys.
   - Maintain fail-open behavior in lifecycle hooks.
5. **Submit a Pull Request**: Open a pull request against the `main` branch with a clear description of your changes.

## Reporting Issues

If you encounter a bug or unexpected behavior:
1. Check existing issues to avoid duplicates.
2. Open a new issue detailing:
   - Your environment (Antigravity version, Node.js version, OpenViking version).
   - Steps to reproduce.
   - Relevant sanitized log entries from `~/.openviking/antigravity/logs/hooks.jsonl`.
