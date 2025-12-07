// app.js

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// State
let trackSet = [];

function initApp() {
    // Check for auth token
    const accessToken = localStorage.getItem('access_token');

    if (accessToken) {
        showBuilder();
    } else {
        showLogin();
    }

    // Wiring
    document.getElementById('login-btn').addEventListener('click', startAuth);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('create-playlist-btn').addEventListener('click', createPlaylist);

    setupDragAndDrop();
    setupRecommendationsToggle();
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('builder-section').classList.add('hidden');
    document.getElementById('user-profile').classList.add('hidden');
}

function showBuilder() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('builder-section').classList.remove('hidden');
    document.getElementById('user-profile').classList.remove('hidden');

    fetchProfile().then(profile => {
        if (profile) {
            document.getElementById('user-name').textContent = `Logged in as ${profile.display_name}`;
        }
    });

    loadTrackSet();
}

function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expiration');
    window.location.reload();
}

// --- Playlist Creation Logic ---

async function createPlaylist() {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken) return;

    if (trackSet.length === 0) {
        alert('Add some tracks first!');
        return;
    }

    const nameInput = document.getElementById('playlist-name');
    const playlistName = nameInput.value || 'My Spotty Playlist';
    const statusMsg = document.getElementById('status-message');

    statusMsg.innerText = 'Preparing tracks...';

    // 1. Gather URIs (base set)
    let finalUris = trackSet.map(t => t.uri);

    // 2. Recommendations?
    const useRecs = document.getElementById('use-recommendations').checked;
    if (useRecs) {
        statusMsg.innerText = 'Fetching recommendations...';
        const count = parseInt(document.getElementById('rec-count').value, 10) || 20;
        const seedIds = trackSet.slice(0, 5).map(t => t.id); // Max 5 seeds

        const recTracks = await fetchRecommendationsIfAllowed(seedIds, count, accessToken);
        if (recTracks.length > 0) {
            finalUris = finalUris.concat(recTracks.map(t => t.uri));
            statusMsg.innerText = `Added ${recTracks.length} recommended tracks. Creating playlist...`;
        } else {
            statusMsg.innerText = 'No recommendations found/allowed. creating base playlist...';
        }
    } else {
        statusMsg.innerText = 'Creating playlist...';
    }

    try {
        // 3. Get User ID
        const profile = await fetchProfile();
        if (!profile) throw new Error('Could not fetch user profile');
        const userId = profile.id;

        // 4. Create Playlist
        const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: playlistName,
                description: 'Created with Spotty Set Builder',
                public: false
            })
        });

        if (!createRes.ok) throw new Error('Failed to create playlist');
        const playlistData = await createRes.json();
        const playlistId = playlistData.id;
        const playlistUrl = playlistData.external_urls.spotify;

        // 5. Add Tracks
        statusMsg.innerText = 'Adding tracks...';
        const chunks = chunkArray(finalUris, 100); // Max 100 tracks per req

        for (const chunk of chunks) {
            await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: chunk })
            });
        }

        statusMsg.innerText = 'Done! Opening Spotify...';
        window.open(playlistUrl, '_blank');

    } catch (err) {
        console.error(err);
        statusMsg.innerText = 'Error: ' + err.message;
    }
}

async function fetchRecommendationsIfAllowed(seedTrackIds, limit, accessToken) {
    if (!seedTrackIds.length) return [];

    const params = new URLSearchParams({
        seed_tracks: seedTrackIds.join(','),
        limit: String(limit)
    });

    try {
        const res = await fetch(`https://api.spotify.com/v1/recommendations?${params.toString()}`, {
            headers: { Authorization: 'Bearer ' + accessToken }
        });

        if (!res.ok) {
            console.warn('Recommendations failed or not allowed', res.status);
            return [];
        }

        const data = await res.json();
        return data.tracks || [];
    } catch (e) {
        console.warn('Error calling recommendations', e);
        return [];
    }
}

// --- Drag & Drop Logic ---

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const textData = e.dataTransfer.getData('text/plain');
        const uriListData = e.dataTransfer.getData('text/uri-list');

        console.log('Dropped text:', textData);
        console.log('Dropped uri-list:', uriListData);

        const input = uriListData || textData;

        // Process the input to find Spotify URIs or Links
        await processDroppedInput(input);
    });
}

function setupRecommendationsToggle() {
    const toggle = document.getElementById('use-recommendations');
    const options = document.getElementById('rec-options');
    toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            options.classList.remove('hidden');
        } else {
            options.classList.add('hidden');
        }
    });
}

// --- Track Processing ---

async function processDroppedInput(input) {
    const tracks = parseSpotifyUris(input);
    if (tracks.length === 0) {
        alert('No valid Spotify tracks found in drop.');
        return;
    }

    // Filter duplicates
    const newTracks = tracks.filter(id => !trackSet.some(t => t.id === id));

    if (newTracks.length === 0) return;

    // Fetch metadata
    await fetchAndAddTracks(newTracks);
}

function parseSpotifyUris(text) {
    const regex = /(?:spotify:track:|https:\/\/open\.spotify\.com\/track\/)([a-zA-Z0-9]+)/g;
    const ids = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        ids.push(match[1]);
    }
    return ids;
}

async function fetchAndAddTracks(ids) {
    const accessToken = localStorage.getItem('access_token');
    // Spotify allows max 50 IDs per request
    const chunks = chunkArray(ids, 50);

    for (const chunk of chunks) {
        try {
            const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            if (!res.ok) throw new Error('Failed to fetch tracks');
            const data = await res.json();

            data.tracks.forEach(track => {
                if (track) { // track can be null if not found
                    trackSet.push({
                        id: track.id,
                        uri: track.uri,
                        name: track.name,
                        artist: track.artists[0].name
                    });
                }
            });
        } catch (err) {
            console.error(err);
        }
    }

    saveTrackSet();
    renderTrackSet();
}

function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// --- Rendering & Storage ---

function saveTrackSet() {
    localStorage.setItem('trackSet', JSON.stringify(trackSet));
    updateCount();
}

function loadTrackSet() {
    const saved = localStorage.getItem('trackSet');
    if (saved) {
        try {
            trackSet = JSON.parse(saved);
            renderTrackSet();
        } catch (e) {
            console.error('Failed to load trackSet', e);
        }
    }
    updateCount();
}

function renderTrackSet() {
    const list = document.getElementById('track-list');
    list.innerHTML = '';

    trackSet.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = 'track-item';
        li.innerHTML = `
            <div class="track-info">
                <span class="track-name">${track.name}</span>
                <span class="track-artist">${track.artist}</span>
            </div>
            <button class="remove-btn" onclick="removeTrack('${track.id}')">×</button>
        `;
        list.appendChild(li);
    });
}

function updateCount() {
    document.getElementById('track-count').textContent = trackSet.length;
}

// Expose removeTrack globally so onclick works
window.removeTrack = function (id) {
    trackSet = trackSet.filter(t => t.id !== id);
    saveTrackSet();
    renderTrackSet();
}
