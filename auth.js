// auth.js

// CONFIGURATION
// REPLACE 'cde5bf3b126944f09a03f530829b2bdb' with your actual Spotify Client ID
const CLIENT_ID = 'cde5bf3b126944f09a03f530829b2bdb';
const SCOPES = 'playlist-modify-private playlist-modify-public user-read-private user-read-email';

// Determine if we are on GitHub Pages (subdirectory) or Localhost (root)
const isGitHubPages = window.location.pathname.startsWith('/spotify-set-builder');
const basePath = isGitHubPages ? '/spotify-set-builder' : '';
const REDIRECT_URI = window.location.origin + basePath + '/callback';

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';

/**
 * Generates a random string for the code verifier.
 */
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Encodes a buffer to Base64 Url Safe string.
 */
function base64urlencode(a) {
    let str = "";
    let bytes = new Uint8Array(a);
    let len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return btoa(str)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/**
 * Hashes the plain text using SHA-256.
 */
async function sha256(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
}

/**
 * Generates the code challenge from the verifier.
 */
async function generateCodeChallenge(v) {
    const hashed = await sha256(v);
    return base64urlencode(hashed);
}

/**
 * Initiates the PKCE Auth Flow.
 */

async function startAuth() {
    // Client ID check removed as it is now set.

    const codeVerifier = generateRandomString(128);

    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store verifier for the callback
    window.sessionStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });


    console.log('Redirecting to Spotify with URI:', REDIRECT_URI);
    window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Handles the redirect from Spotify.
 */
async function handleRedirectCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
        console.error('Auth error:', error);
        document.getElementById('message').innerText = 'Authentication failed: ' + error;
        return;
    }

    if (!code) {
        console.error('No code found in URL');
        document.getElementById('message').innerText = 'No authentication code found.';
        return;
    }

    const codeVerifier = window.sessionStorage.getItem('code_verifier');
    if (!codeVerifier) {
        console.error('No code_verifier found in session storage');
        document.getElementById('message').innerText = 'Security error: missing code verifier.';
        return;
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: codeVerifier
        });

        const response = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (!response.ok) {
            throw new Error('Token request failed: ' + response.statusText);
        }

        const data = await response.json();

        // Store tokens
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }

        // Calculate and store expiration
        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem('token_expiration', expiresAt);

        // Redirect to main app
        const appUrl = window.location.origin + (isGitHubPages ? '/spotify-set-builder/' : '/');
        window.location.href = appUrl;

    } catch (err) {
        console.error('Error getting token:', err);
        document.getElementById('message').innerText = 'Error getting token: ' + err.message;
    }
}

/**
 * Fetches the current user's profile.
 */
async function fetchProfile() {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return null;

    try {
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: 'Bearer ' + accessToken
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('access_token');
                window.location.reload();
                return null;
            }
            throw new Error('Failed to fetch profile');
        }

        return await response.json();
    } catch (e) {
        console.error(e);
        return null;
    }
}
