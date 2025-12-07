# Spotify Set Builder

A static web app to build Spotify playlists by dragging and dropping tracks, with optional recommendations.

## Features

- **Drag & Drop**: Drag tracks or albums directly from the Spotify Desktop App or Web Player into the browser.
- **Recommendations**: Optionally extend your playlist with Spotify's recommendation algorithm (best-effort basis).
- **Playlist Creation**: One-click playlist creation that opens directly in Spotify.
- **Secure Auth**: Uses PKCE (Proof Key for Code Exchange) for secure client-side authentication.

## Usage

1. **Connect**: Click "Connect to Spotify" and log in.
2. **Build Your Set**:
   - Open Spotify (Desktop or Web).
   - Drag a song or album.
   - Drop it into the "Drop Spotify Tracks Here" zone in the app.
3. **Configure**:
   - (Optional) Check "Use recommendations to expand playlist".
   - Enter a name for your playlist.
4. **Create**:
   - Click "Create Playlist".
   - The app will generate the playlist and open it in a new tab.

## Local Development

pw
1. Clone the repo.
2. Run a local server (e.g., Python):
   ```bash
   python3 -m http.server 3000
   ```
3. Open `http://localhost:3000` in your browser.
4. Note: Ensure `http://localhost:3000/callback` is added to your Spotify App's Redirect URIs in the developer dashboard.

## Deployment

This app is designed to run on GitHub Pages.
1. Push to your repository.
2. Enable GitHub Pages in Settings -> Pages (Source: main branch).
3. Add your GitHub Pages URL (plus `/callback`) to the Spotify Dashboard Redirect URIs.
