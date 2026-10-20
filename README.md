# Framecraft

A small, local-only mockup creator. Upload a screenshot, select a phone or desktop frame, choose a background, tune the scale/rotation, and export a PNG.

## Run it

### Fastest option

1. Open the project folder.
2. Double-click [`index.html`](./index.html).
3. The app opens in your browser and is ready to use.

### Local server option

If your browser blocks any local-file behavior, run a simple local web server from this folder:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

If `py` is not available, try:

```powershell
python -m http.server 8000
```

## Use the creator

1. Use **＋ Phone** or **＋ Desktop** to add as many devices as you need.
2. Click a device in the list to select it.
3. Drop an image into the upload area, or click it and browse for a PNG, JPG, WebP, or GIF. Each device can have its own screenshot.
4. Use the **Phone** or **Desktop** controls to change the selected device.
5. Choose **Warm gradient**, **Solid color**, or **Transparent**.
6. Choose **Personal image** and select a local image to use as the background.
7. Adjust scale, rotation, horizontal position, and vertical position for the selected device.
8. Desktop frames include a visible MacBook-style keyboard, trackpad, aluminum palm rest, lower lip, and stand.
9. Select an export format: **Square (1:1)**, **Portrait (4:5)**, **Story (9:16)**, or **Landscape (16:9)**.
10. Click **Export PNG** to download the complete multi-device composition in that standard size.

You can combine phones and desktops in the same composition. Click the `×` beside a device to remove it.

Images are processed in the browser and are not uploaded to a server.

## Project files

- `index.html` — app structure and controls
- `styles.css` — layout, responsive styling, and device frames
- `app.js` — image handling, live preview state, and PNG export
- `macbook-frame.svg` — the supplied MacBook desktop frame asset

No package installation or build step is required.
