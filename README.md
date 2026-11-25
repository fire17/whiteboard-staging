# S Whiteboard (staging)

Shared offline-first whiteboard for phones and TVs.

Site: https://swhiteboard.akeyo.io (staging, experimental). Stable: https://whiteboard.akeyo.io

This branch contains the static GitHub Pages release. Board links use /b/CODE, and ?tv=1 opens the TV view. A custom 404 preserves deep links.

The frontend is served by GitHub Pages; Yjs persistence, WebSocket sync and WebRTC signaling are served separately at https://sega-discount-ordering-lines.trycloudflare.com. That backend is currently a Mac-hosted temporary tunnel, not permanent hosting. No board contents are included in this repository.
