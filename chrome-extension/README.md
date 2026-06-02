# Client Food Service Chrome Extension (Demo)

Adapted copy of the DietCombo Chrome extension for demoing against **Client Food Service** at [scn.demo.poel.ai](https://scn.demo.poel.ai/).

The upstream extension is unchanged in `../dietcombo copy/chrome-extension/` and `../chrome-extension-original/`.

## Install

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `chrome-extension-demo`

## Configure

1. Click the extension icon to open the side panel
2. Click **Settings** (gear at the bottom)
3. **Base URL:** `https://scn.demo.poel.ai` (default)
4. **API Key:** must match `EXTENSION_API_KEY` on the demo-food server
5. Click **Test connection**, then **Save Settings**

For local dev against `http://localhost:3000`, change the base URL in settings.

## Usage

1. Open a client case in Unite Us (optional — use **Auto Fill from Page**)
2. Fill in client details in the side panel
3. Choose **Unite account** (Regular or Brooklyn)
4. Click **Submit** to create the client via `POST /api/extension/create-client`

## API endpoints used

- `POST /api/extension/create-client`
- `GET /api/extension/statuses`
- `GET /api/extension/navigators`
- `GET /api/geocode?q=…&provider=…`

All require `Authorization: Bearer <EXTENSION_API_KEY>`.

## Icons

Icons in `icons/` are generated from the Client Food Service app logo. Regenerate with:

```bash
LOGO="../demo-food/public/app-logo.png"
for s in 16 48 128; do sips -z $s $s "$LOGO" --out "icons/icon${s}.png"; done
```

## Reload after changes

On `chrome://extensions/`, click the refresh icon on this extension card.
