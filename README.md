# Trinity

The Matrix client that needs a better tagline.

A lightweight, fast Matrix client built with vanilla JS and Vite. No framework overhead.

## Features

- Multi-account support
- Spaces and DMs
- End-to-end encryption status
- Emoji reactions (Emoji 17.0)
- File attachments
- Reply threading
- Member profiles
- Typing indicators
- Mention autocomplete (@user)
- Message deletion (redaction)
- Desktop notifications with sound
- Persistent settings (appearance, notifications, privacy)

## Settings

### Appearance
- Compact message layout
- Member list visibility
- Accent colour theme (purple, blue, green, orange, red)

### Notifications
- Desktop notifications — system-level popups for new messages (browser permission required)
- Notify on @mention only — limit notifications to messages that mention you
- Notification sound — plays a sound when a notification fires

### Privacy
- Read receipts
- Typing indicators
- Online presence

## Requirements

- Node.js 18+
- A Matrix account (matrix.org or any homeserver)

## Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Production build

```bash
npm run build
```

Outputs static files to `dist/`. Deploy to any static host (Netlify, Vercel, Cloudflare Pages, nginx, etc.).

The app must be served over HTTPS in production — the Matrix SDK requires a secure context.

### nginx example

```nginx
server {
    listen 443 ssl;
    root /var/www/trinity/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Tech stack

- [Vite](https://vitejs.dev/) — build tool
- [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) — Matrix client SDK
- [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element) — emoji picker
