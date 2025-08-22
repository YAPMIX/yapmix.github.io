document.addEventListener("DOMContentLoaded", () => {
    let controller = new AbortController();
    const checkButton = document.getElementById("check");
    const clearButton = document.getElementById("clear");
    const downloadButton = document.getElementById("dl");
    const fileInput = document.getElementById("file");
    const urlInput = document.getElementById("playlisturl");
    const tableBody = document.querySelector("tbody");
    const scanIndicator = document.getElementById("scind");
    const progressBar = document.getElementById("progress-bar");

    let activeChannels = [];
    let totalChannels = 0;
    let checkedChannels = 0;
    let onlineChannels = 0;
    let offlineChannels = 0;

    downloadButton.disabled = true;

    checkButton.addEventListener("click", async (event) => {
        event.preventDefault();
        tableBody.innerHTML = "";
        activeChannels = [];
        checkedChannels = onlineChannels = offlineChannels = 0;
        totalChannels = 0;
        progressBar.style.width = "0%";
        let playlistContent = "";

        if (urlInput.value) {
            playlistContent = await fetchM3UFromURL(urlInput.value);
        } else if (fileInput.files.length > 0) {
            playlistContent = await readM3UFile(fileInput.files[0]);
        } else {
            scanIndicator.textContent = "Error: No Playlist Detected, Try again";
            return;
        }

        if (playlistContent) {
            const channels = parseM3U(playlistContent);
            totalChannels = channels.length;
            await checkChannels(channels);
            if (!controller.signal.aborted) {
                scanIndicator.textContent =
                  `Finished. Loaded: ${totalChannels} | Checked: ${checkedChannels} | ✅ Online: ${onlineChannels} | ❌ Offline: ${offlineChannels}`;
                downloadButton.disabled = false;
            }
        }
    });

    clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        controller.abort();
        tableBody.innerHTML = "";
        fileInput.value = "";
        urlInput.value = "";
        activeChannels = [];
        checkedChannels = onlineChannels = offlineChannels = totalChannels = 0;
        scanIndicator.textContent = "Finished. Loaded: 0 | Checked: 0 | ✅ Online: 0 | ❌ Offline: 0";
        progressBar.style.width = "0%";
        downloadButton.disabled = true;
        controller = new AbortController();
    });

    downloadButton.addEventListener("click", () => {
        if (activeChannels.length === 0) {
            scanIndicator.textContent = "Error: No active channels to download. Please run a check first.";
            return;
        }
        downloadActiveChannels();
    });

    async function fetchM3UFromURL(url) {
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Failed: ${response.status}`);
            return await response.text();
        } catch {
            return "";
        }
    }

    function readM3UFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject("");
            reader.readAsText(file);
        });
    }

    function parseM3U(content) {
        const lines = content.split("\n");
        const channels = [];
        let channelInfo = {};
        lines.forEach((line) => {
            if (line.startsWith("#EXTINF")) {
                const nameMatch = line.match(/,(.*)$/);
                channelInfo.name = nameMatch ? nameMatch[1] : "Unknown Channel";
            } else if (line.startsWith("http")) {
                channelInfo.url = line.trim();
                channels.push({ ...channelInfo });
                channelInfo = {};
            }
        });
        return channels;
    }

    async function checkChannels(channels) {
        for (const [index, channel] of channels.entries()) {
            checkButton.disabled = true;
            clearButton.disabled = true;
            const row = document.createElement("tr");
            row.innerHTML = `
                <th scope="row">${index + 1}</th>
                <td>${channel.name}</td>
                <td>Checking...</td>
                <td>Loading...</td>
            `;
            tableBody.appendChild(row);

            try {
                const status = await checkChannelStatus(channel.url);
                row.children[2].textContent = status.online ? "Online" : "Offline";
                row.children[3].textContent = status.code;
                if (status.online) {
                    activeChannels.push(channel);
                    onlineChannels++;
                } else {
                    offlineChannels++;
                }
            } catch {
                row.children[2].textContent = "Error";
                row.children[3].textContent = "Network Error";
                offlineChannels++;
            }

            checkedChannels = index + 1;
            const percentage = Math.round((checkedChannels / totalChannels) * 100);
            progressBar.style.width = percentage + "%";

            scanIndicator.textContent =
              `Finished. Loaded: ${totalChannels} | Checked: ${checkedChannels} | ✅ Online: ${onlineChannels} | ❌ Offline: ${offlineChannels}`;

            row.addEventListener("click", () => {
                const playerContainer = document.getElementById("player-container");
                const player = document.getElementById("iptv-player");
                player.src = channel.url;
                playerContainer.style.display = "block";
            });

            if (controller.signal.aborted) break;
        }
    }

    async function checkChannelStatus(url) {
        try {
            const response = await fetch(url, { method: "HEAD", signal: controller.signal });
            return { online: response.ok, code: response.status };
        } catch {
            return { online: false, code: "Network Error" };
        }
    }

    function downloadActiveChannels() {
        const content = createM3UContent(activeChannels);
        const d = new Date();
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${d.getMonth()+1}-${d.getDate()}-${d.getFullYear()}-list.m3u`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function createM3UContent(channels) {
        let content = "#EXTM3U\n";
        channels.forEach(ch => {
            content += `#EXTINF:-1,${ch.name}\n${ch.url}\n`;
        });
        return content;
    }

    document.getElementById("close-player").addEventListener("click", () => {
        const playerContainer = document.getElementById("player-container");
        const player = document.getElementById("iptv-player");
        player.pause();
        player.src = "";
        playerContainer.style.display = "none";
    });
});
