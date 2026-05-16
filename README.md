# Simple Firefox Add-on

This is a minimal WebExtension scaffold for Firefox (Manifest V3).

## Files
- `manifest.json` - extension manifest
- `popup.html` / `popup.js` - toolbar popup UI
- `background.js` - background service worker

## Load as a temporary add-on in Firefox
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file from this folder.

The extension will appear in the toolbar; open the popup and click the button to show the current tab's URL.

## Next steps
- Add icons in the manifest and `icons/` folder.
- Add more permissions only when necessary.
