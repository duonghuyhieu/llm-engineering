(function () {
    const LESSONS = window.LESSONS || [];
    const MANIFEST = window.MANIFEST || { weeks: [] };

    const navEl = document.getElementById("nav");
    const lessonEl = document.getElementById("lesson");
    const welcomeEl = document.getElementById("welcome");
    const searchEl = document.getElementById("search");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const readFill = document.getElementById("readFill");
    const readText = document.getElementById("readText");
    const resetReadBtn = document.getElementById("resetRead");
    const themeBtn = document.getElementById("themeToggle");

    const lessonByKey = {};
    LESSONS.forEach(l => { lessonByKey[`w${l.week}d${l.day}`] = l; });

    // ===== Read tracking =====
    const READ_STORAGE_KEY = "tomtat:read";

    function getReadSet() {
        try {
            const raw = localStorage.getItem(READ_STORAGE_KEY);
            return new Set(raw ? JSON.parse(raw) : []);
        } catch {
            return new Set();
        }
    }

    function saveReadSet(set) {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...set]));
    }

    function isRead(key) {
        return getReadSet().has(key);
    }

    function toggleRead(key) {
        const set = getReadSet();
        if (set.has(key)) set.delete(key);
        else set.add(key);
        saveReadSet(set);
        renderNav(searchEl.value);                  // refresh sidebar checkmarks
        updateLessonReadButton(key);                 // refresh button trong lesson
        return set.has(key);
    }

    function resetRead() {
        if (!confirm("Xóa tất cả đánh dấu đã đọc?")) return;
        localStorage.removeItem(READ_STORAGE_KEY);
        renderNav(searchEl.value);
        const currentKey = location.hash.replace("#", "");
        if (currentKey) updateLessonReadButton(currentKey);
    }

    // ===== Nav =====
    function renderNav(filter = "") {
        navEl.innerHTML = "";
        const f = filter.trim().toLowerCase();
        const readSet = getReadSet();

        MANIFEST.weeks.forEach(week => {
            const block = document.createElement("div");
            block.className = "week-block";
            const title = document.createElement("div");
            title.className = "week-title";

            // Đếm bao nhiêu bài trong tuần đã đọc
            const weekKeys = week.days.map(d => `w${week.week}d${d.day}`);
            const weekRead = weekKeys.filter(k => readSet.has(k)).length;
            const weekTotal = week.days.filter(d => lessonByKey[`w${week.week}d${d.day}`]).length;
            const weekStat = weekTotal > 0 ? `${weekRead}/${weekTotal}` : "";

            title.innerHTML = `<span>Tuần ${week.week} · ${week.title}</span><span class="week-stat">${weekStat}</span>`;
            block.appendChild(title);

            let visibleCount = 0;
            week.days.forEach(day => {
                const key = `w${week.week}d${day.day}`;
                const lesson = lessonByKey[key];
                const haystack = `${week.title} ${day.title} ${lesson ? (lesson.summary + " " + (lesson.topics || []).join(" ")) : ""}`.toLowerCase();
                if (f && !haystack.includes(f)) return;

                const link = document.createElement("a");
                const read = readSet.has(key);
                link.className = "day-link" + (lesson ? "" : " pending") + (read ? " read" : "");
                link.dataset.key = key;
                link.innerHTML = `
                    <div class="day-tag">${read ? "✓" : "D" + day.day}</div>
                    <div class="day-text">
                        <span class="title">${day.title}</span>
                        ${lesson ? "" : '<span class="sub">⏳ chưa tóm tắt</span>'}
                    </div>
                `;
                if (lesson) {
                    link.addEventListener("click", () => showLesson(key));
                }
                block.appendChild(link);
                visibleCount++;
            });

            if (visibleCount > 0) navEl.appendChild(block);
        });

        updateProgress();
    }

    function updateProgress() {
        const totalDays = MANIFEST.weeks.reduce((s, w) => s + w.days.length, 0);
        const summarized = LESSONS.length;
        const readCount = getReadSet().size;

        const pctSum = totalDays ? Math.round((summarized / totalDays) * 100) : 0;
        progressFill.style.width = pctSum + "%";
        progressText.textContent = `${summarized}/${totalDays} (${pctSum}%)`;

        const pctRead = totalDays ? Math.round((readCount / totalDays) * 100) : 0;
        readFill.style.width = pctRead + "%";
        readText.textContent = `${readCount}/${totalDays} (${pctRead}%)`;
    }

    // ===== Lesson =====
    function showLesson(key) {
        const lesson = lessonByKey[key];
        if (!lesson) return;

        welcomeEl.classList.add("hidden");
        lessonEl.classList.remove("hidden");

        document.querySelectorAll(".day-link").forEach(a => a.classList.remove("active"));
        const active = document.querySelector(`.day-link[data-key="${key}"]`);
        if (active) active.classList.add("active");

        lessonEl.innerHTML = renderLesson(lesson, key);
        lessonEl.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
        lessonEl.querySelectorAll(".copy-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const code = btn.closest(".code-block").querySelector("pre code").innerText;
                navigator.clipboard.writeText(code);
                btn.textContent = "✓ Đã chép";
                setTimeout(() => (btn.textContent = "Copy"), 1500);
            });
        });

        const markBtn = lessonEl.querySelector(".mark-read-btn");
        if (markBtn) {
            markBtn.addEventListener("click", () => toggleRead(key));
        }
        const nextBtn = lessonEl.querySelector(".next-lesson-btn");
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                const next = nextBtn.dataset.nextKey;
                if (next) showLesson(next);
            });
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
        history.replaceState(null, "", "#" + key);
    }

    function updateLessonReadButton(key) {
        const btn = lessonEl.querySelector(".mark-read-btn");
        if (!btn) return;
        const read = isRead(key);
        btn.classList.toggle("is-read", read);
        btn.textContent = read ? "✓ Đã đọc — bỏ đánh dấu" : "Đánh dấu đã đọc";
    }

    function getNextLessonKey(currentKey) {
        // Tìm lesson tiếp theo trong manifest order
        const flat = [];
        MANIFEST.weeks.forEach(w => w.days.forEach(d => {
            const k = `w${w.week}d${d.day}`;
            if (lessonByKey[k]) flat.push(k);
        }));
        const idx = flat.indexOf(currentKey);
        return (idx >= 0 && idx < flat.length - 1) ? flat[idx + 1] : null;
    }

    function renderLesson(l, key) {
        const md = (s) => marked.parse(s || "");
        const topics = (l.topics || []).map(t => `<li>${escape(t)}</li>`).join("");
        const keyPoints = (l.keyPoints || []).map(t => `<li>${md(t)}</li>`).join("");
        const codeBlocks = (l.code || []).map(c => `
            ${c.before ? `<div class="code-context before">${md(c.before)}</div>` : ""}
            <div class="code-block">
                <div class="code-title">
                    <strong>${escape(c.title)}</strong>
                    <button class="copy-btn">Copy</button>
                </div>
                <pre><code class="language-${c.lang || "python"}">${escape(c.code)}</code></pre>
            </div>
            ${c.after ? `<div class="code-context after">${md(c.after)}</div>` : ""}
        `).join("");
        const callouts = (l.callouts || []).map(c =>
            `<div class="callout ${c.type === "warn" ? "warn" : ""}">${md(c.text)}</div>`
        ).join("");
        const notebooks = (l.notebooks || []).map(nb =>
            `<a class="notebook-link" href="../${nb}" target="_blank">📓 ${nb}</a>`
        ).join("");

        const read = isRead(key);
        const nextKey = getNextLessonKey(key);
        const nextLesson = nextKey ? lessonByKey[nextKey] : null;

        return `
            <div class="crumbs">Tuần ${l.week} › Day ${l.day}</div>
            <h2>${escape(l.title)}</h2>
            <div class="meta">
                <span>⏱ Tuần ${l.week}</span>
                <span>📅 Day ${l.day}</span>
                ${l.duration ? `<span>🎬 ${escape(l.duration)}</span>` : ""}
                ${read ? '<span class="read-badge">✓ đã đọc</span>' : ""}
            </div>
            ${notebooks ? `<section><h3>Notebook gốc</h3>${notebooks}</section>` : ""}
            ${topics ? `<section><h3>Nội dung chính</h3><ul>${topics}</ul></section>` : ""}
            ${l.summary ? `<section><h3>Tóm tắt</h3>${md(l.summary)}</section>` : ""}
            ${keyPoints ? `<section><h3>Điểm cần nhớ</h3><ul>${keyPoints}</ul></section>` : ""}
            ${callouts ? `<section><h3>Lưu ý</h3>${callouts}</section>` : ""}
            ${codeBlocks ? `<section><h3>Code mẫu</h3>${codeBlocks}</section>` : ""}

            <section class="finish-section">
                <button class="mark-read-btn ${read ? "is-read" : ""}">
                    ${read ? "✓ Đã đọc — bỏ đánh dấu" : "Đánh dấu đã đọc"}
                </button>
                ${nextLesson ? `
                    <button class="next-lesson-btn" data-next-key="${nextKey}">
                        Bài tiếp: Tuần ${nextLesson.week} · Day ${nextLesson.day} →
                    </button>
                ` : '<span class="finish-final">🎉 Đây là bài cuối cùng</span>'}
            </section>
        `;
    }

    function escape(s) {
        return String(s ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ===== Search =====
    let searchTimer;
    searchEl.addEventListener("input", e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => renderNav(e.target.value), 120);
    });

    // ===== Theme =====
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeBtn.textContent = savedTheme === "dark" ? "🌙" : "☀";
    themeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        const next = cur === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
        themeBtn.textContent = next === "dark" ? "🌙" : "☀";
    });

    // ===== Reset read =====
    if (resetReadBtn) {
        resetReadBtn.addEventListener("click", resetRead);
    }

    // ===== Init =====
    renderNav();
    if (location.hash) {
        const key = location.hash.replace("#", "");
        if (lessonByKey[key]) showLesson(key);
    }
})();
