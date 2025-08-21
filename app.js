// app.js with draggable floating player

function parseM3U(content) {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const channels = [];
    let currentName = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("#EXTINF")) {
            const nameMatch = line.split(",");
            currentName = nameMatch.length > 1 ? nameMatch[1].trim() : "Unknown";
        } else if (!line.startsWith("#")) {
            channels.push({ name: currentName || "Unknown", url: line });
            currentName = "";
        }
    }
    return channels;
}

async function checkStream(url) {
    try {
        const res = await fetch(url, { method: "HEAD" });
        return { status: res.ok ? "✅ Online" : "❌ Offline", code: res.status };
    } catch {
        return { status: "❌ Offline", code: "ERR" };
    }
}

function downloadFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// --- функция для перетаскивания ---
function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("file");
    const urlInput = document.getElementById("playlisturl");
    const textarea = document.getElementById("manualm3u");
    const checkBtn = document.getElementById("check");
    const clearBtn = document.getElementById("clear");
    const dlBtn = document.getElementById("dl");
    const stopBtn = document.getElementById("stop");
    const statusDiv = document.getElementById("scind");
    const tbody = document.querySelector("tbody");
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    const closePlayerBtn = document.getElementById("close-player");
    const playerContainer = document.getElementById("player-container");
    const videoPlayer = document.getElementById("video-player");

    if (playerContainer) makeDraggable(playerContainer);

    let allChannels = [];
    let isStopped = false;
    window._activeChannels = [];

    checkBtn.addEventListener("click", async () => {
        tbody.innerHTML = "";
        statusDiv.textContent = "Status: Checking...";
        progressContainer.style.display = "block";
        progressBar.style.width = "0%";
        isStopped = false;

        let m3uContent = "";
        if (fileInput.files.length > 0) {
            m3uContent = await fileInput.files[0].text();
        } else if (urlInput.value.trim() !== "") {
            try {
                const res = await fetch(urlInput.value.trim());
                m3uContent = await res.text();
            } catch {
                alert("Не удалось загрузить плейлист по URL");
                return;
            }
        } else {
            m3uContent = textarea.value;
        }

        allChannels = parseM3U(m3uContent);
        window._activeChannels = [];

        let checkedCount = 0;

        for (let idx = 0; idx < allChannels.length; idx++) {
            if (isStopped) {
                statusDiv.textContent = `Stopped at ${checkedCount}/${allChannels.length}`;
                break;
            }
            const ch = allChannels[idx];
            const result = await checkStream(ch.url);
            checkedCount++;
            const percent = Math.round((checkedCount / allChannels.length) * 100);
            statusDiv.textContent = `Checking... ${percent}%`;
            progressBar.style.width = percent + "%";

            const { status, code } = result;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${ch.name}</td>
                <td>${status}</td>
                <td>${code}</td>
                <td><button class="play-btn">▶️</button></td>
            `;
            tbody.appendChild(tr);

            if (status.includes("Online")) {
                window._activeChannels.push(ch);
            }

            tr.querySelector(".play-btn").addEventListener("click", () => {
                playChannelWithNavigation(ch, window._activeChannels.indexOf(ch));
            });
        }

        if (!isStopped) {
            statusDiv.textContent = `Status: Checked ${allChannels.length} channels. Active: ${window._activeChannels.length}`;
            progressBar.style.width = "100%";
        }
    });

    stopBtn.addEventListener("click", () => {
        isStopped = true;
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.removeAttribute("src");
            videoPlayer.load();
        }
        if (playerContainer) playerContainer.style.display = "none";
    });

    if (closePlayerBtn) {
        closePlayerBtn.addEventListener("click", () => {
            if (videoPlayer) {
                videoPlayer.pause();
                videoPlayer.removeAttribute("src");
                videoPlayer.load();
            }
            if (playerContainer) playerContainer.style.display = "none";
        });
    }

    clearBtn.addEventListener("click", () => {
        tbody.innerHTML = "";
        window._activeChannels = [];
        allChannels = [];
        statusDiv.textContent = "Status: Cleared.";
        progressContainer.style.display = "none";
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.removeAttribute("src");
            videoPlayer.load();
        }
        if (playerContainer) playerContainer.style.display = "none";
    });

    dlBtn.addEventListener("click", () => {
        if (window._activeChannels.length === 0) {
            alert("Нет активных каналов для сохранения.");
            return;
        }
        let content = "#EXTM3U\n";
        window._activeChannels.forEach(ch => {
            content += `#EXTINF:-1, ${ch.name}\n${ch.url}\n`;
        });
        downloadFile("active_playlist.m3u", content);
    });
});
