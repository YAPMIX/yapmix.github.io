document.addEventListener("DOMContentLoaded", () => {
    let controller = new AbortController();
    const checkButton = document.getElementById("check");
    const clearButton = document.getElementById("clear");
    const downloadButton = document.getElementById("dl");
    const fileInput = document.getElementById("file");
    const urlInput = document.getElementById("playlisturl");
    const tableBody = document.querySelector("tbody");
    const scanIndicator = document.getElementById("scind");

    window._activeChannels = [];
    let totalChannels = 0;
    let hlsInstance = null;

    downloadButton.disabled = true;

    checkButton.addEventListener("click", async (event) => {
        event.preventDefault();
        tableBody.innerHTML = "";
        window._activeChannels = [];
        let playlistContent = "";

        if (urlInput.value) {
            playlistContent = await fetchM3UFromURL(urlInput.value);
        } else if (fileInput.files.length > 0) {
            playlistContent = await readM3UFile(fileInput.files[0]);
        } else if (window._manualM3U) {
            playlistContent = window._manualM3U;
        } else {
            scanIndicator.textContent = "Error: No Playlist Detected, Try again";
            return;
        }

        if (playlistContent) {
            const channels = parseM3U(playlistContent);
            if (channels.length === 0) {
                scanIndicator.textContent = "Error: Playlist is empty or invalid.";
                resetButtons();
                return;
            }
            totalChannels = channels.length;
            scanIndicator.textContent = "Status: Scanning (0%)";
            const actives = await checkChannels(channels);
            if (!controller.signal.aborted) {
                window._activeChannels = actives;
                scanIndicator.textContent = `Status: Done. Active: ${actives.length}/${channels.length}`;
                downloadButton.disabled = actives.length === 0;
                clearButton.disabled = false;
                checkButton.disabled = false;
            }
        }
    });

    clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        controller.abort();
        resetUI();
    });

    downloadButton.addEventListener("click", () => {
        if (window._activeChannels.length === 0) {
            scanIndicator.textContent = "Error: No active channels to download. Please run a check first.";
            return;
        }
        downloadActiveChannels();
    });

    function resetUI() {
        tableBody.innerHTML = "";
        fileInput.value = "";
        urlInput.value = "";
        window._activeChannels = [];
        scanIndicator.textContent = "Status: Ready / Waiting for file...";
        downloadButton.disabled = true;
        resetButtons();
        controller = new AbortController();
    }

    function resetButtons() {
        checkButton.disabled = false;
        clearButton.disabled = false;
    }

    async function fetchM3UFromURL(url) {
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
            return await response.text();
        } catch (error) {
            scanIndicator.textContent = "Error: fetching the M3U file.";
            console.error(error);
            resetButtons();
            return "";
        }
    }

    function readM3UFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => {
                scanIndicator.textContent = "Error: reading the file.";
                console.error(error);
                resetButtons();
                reject("");
            };
            reader.readAsText(file);
        });
    }

    function parseM3U(content) {
        const lines = content.replace(/\r\n/g, "\n").split("\n");
        const channels = [];
        let channelInfo = {};

        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;

            if (line.startsWith("#EXTINF")) {
                const nameMatch = line.match(/,(.*)$/);
                channelInfo.name = nameMatch ? nameMatch[1].trim() : "Unknown Channel";
                channelInfo.meta = line;
            } else if (/^(https?|rtmp|rtsp):\/\//i.test(line)) {
                channelInfo.url = line;
                if (!channelInfo.name) channelInfo.name = line;
                channels.push({ ...channelInfo });
                channelInfo = {};
            }
        }
        return channels;
    }

    async function checkChannels(channels) {
        const actives = [];

        for (const [index, channel] of channels.entries()) {
            checkButton.disabled = true;
            clearButton.disabled = true;

            const row = document.createElement("tr");
            row.innerHTML = `
                <th scope="row">${index + 1}</th>
                <td>${escapeHtml(channel.name)}</td>
                <td>Checking...</td>
                <td>...</td>
                <td><a href="#" data-url="${channel.url}" class="play-link">▶️</a></td>
            `;
            const link = row.querySelector(".play-link");
            link.addEventListener("click", (e) => {
                e.preventDefault();
                playChannel(channel.url, channel.name);
            });
            tableBody.appendChild(row);

            try {
                const status = await checkChannelStatus(channel.url);
                row.children[2].textContent = status.online ? "Online" : "Offline";
                row.children[3].textContent = status.code;
                if (status.online) actives.push(channel);
            } catch (error) {
                row.children[2].textContent = "Error";
                row.children[3].textContent = "Network Error";
            }

            const percentage = Math.round(((index + 1) / totalChannels) * 100);
            scanIndicator.textContent = `Status: Scanning (${percentage}%)`;

            if (controller.signal.aborted) {
                scanIndicator.textContent = "Status: Scan aborted.";
                downloadButton.disabled = true;
                resetButtons();
                break;
            }
        }
        return actives;
    }

    async function checkChannelStatus(url) {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 5000);
        try {
            const resp = await fetch(url, {
                method: "GET",
                headers: { "Range": "bytes=0-1" },
                mode: "no-cors",
                signal: ctrl.signal
            });
            clearTimeout(timeout);
            if (resp.type === "opaque") {
                return { online: true, code: "opaque" };
            }
            return { online: resp.ok, code: resp.status };
        } catch (e) {
            clearTimeout(timeout);
            if (e.name === "AbortError") return { online: false, code: "Timeout" };
            return { online: false, code: "Network Error" };
        }
    }

    function createM3UContent(channels) {
        let content = "#EXTM3U\n";
        channels.forEach((channel) => {
            if (channel.meta) {
                content += `${channel.meta}\n${channel.url}\n`;
            } else {
                content += `#EXTINF:-1,${channel.name}\n${channel.url}\n`;
            }
        });
        return content;
    }

    function downloadActiveChannels() {
        const content = createM3UContent(window._activeChannels);
        const d = new Date();
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-active.m3u`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        URL.revokeObjectURL(url);
    }

    function playChannel(url, name = "") {
        const playerContainer = document.getElementById("player-container");
        const nameSpan = document.getElementById("current-channel-name");
        const videoPlayer = document.getElementById("video-player");
        if (!videoPlayer) return;

        if (nameSpan && name) nameSpan.textContent = name;

        if (hlsInstance) {
            try { hlsInstance.destroy(); } catch(_) {}
            hlsInstance = null;
        }

        if (window.Hls && window.Hls.isSupported()) {
            hlsInstance = new window.Hls();
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(videoPlayer);
            hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, function () {
                videoPlayer.play().catch(()=>{});
            });
        } else if (videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
            videoPlayer.src = url;
            videoPlayer.play().catch(()=>{});
        } else {
            alert("Your browser cannot play HLS streams.");
        }
        if (playerContainer) playerContainer.style.display = "block";
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
