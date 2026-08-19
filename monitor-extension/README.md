# Extension Guard Monitor

Real-time security monitoring Chrome extension for Extension Guard v2.0.

## Features

- 🔍 **Real-time monitoring** of installed extensions
- 📊 **Live risk scoring** with local and cloud-based analysis
- 🔄 **Automatic detection** of extension updates and version changes
- 🚨 **Instant notifications** for critical security issues
- 🌐 **Cloud sync** with Extension Guard backend via WebSocket
- 📈 **Historical tracking** of extension changes and supply chain events
- 🛡️ **Local risk analysis** works offline without backend
- ⚡ **Supply chain attack detection** via differential analysis
- 🎯 **Threat intelligence** integration for known malicious extensions
- 🔔 **Smart alerts** with configurable severity levels

## Installation

### Development

```bash
# Install dependencies
npm install

# Build for development (with watch mode)
npm run dev

# Load unpacked extension in Chrome:
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `dist` folder
```

### Production Build

```bash
npm run build
```

## Architecture

```
monitor-extension/
├── src/
│   ├── background/          # Service worker
│   │   ├── index.ts         # Main background logic
│   │   ├── websocket.ts     # WebSocket connection manager
│   │   └── storage.ts       # Chrome storage wrapper
│   ├── popup/               # Popup UI
│   │   ├── App.tsx          # Main React component
│   │   ├── index.html       # Popup HTML
│   │   └── styles.css       # Tailwind styles
│   ├── constants.ts         # Shared constants
│   ├── types.ts             # TypeScript types
│   └── manifest.json        # Extension manifest
└── dist/                    # Build output
```

## Permissions

- `management` - List and monitor installed extensions
- `storage` - Store configuration and cached data
- `alarms` - Schedule periodic checks
- `notifications` - Alert users of security issues
- `webRequest` (optional) - Monitor network requests from extensions

## Configuration

1. Get an API key from Extension Guard dashboard
2. Open extension popup → Settings
3. Enter your API key
4. Configure alert preferences

## Tech Stack

- TypeScript
- React 18
- Vite (build tool)
- Tailwind CSS
- Chrome Extensions API (Manifest V3)
- WebSocket for real-time communication

## Development Notes

- Uses Manifest V3 (modern extension standard)
- Service worker instead of background pages
- WebSocket connection for real-time updates
- React for popup UI with Tailwind styling
- Type-safe with TypeScript throughout

## License

MIT
