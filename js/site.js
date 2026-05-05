/**
 * @fileoverview ハッシュルーティングと fetch による静的サイト描画（GitHub Pages 想定）。
 */
(function () {
  "use strict";

  const ARTICLES_DIR = "記事用テキストファイル";
  const MANUALS_DIR = "マニュアル用";
  const SEP = "++++++++++";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function splitMetaLine(line) {
    const parts = line.split(",");
    if (parts.length < 3) {
      return { a: parts[0] || "", b: parts[1] || "", c: parts.slice(2).join(",") };
    }
    return { a: parts[0], b: parts[1], c: parts.slice(2).join(",") };
  }

  function parseTags(raw) {
    if (!raw) return [];
    return raw.split("|").map((t) => t.trim()).filter(Boolean);
  }

  function parseArticle(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const meta = splitMetaLine(lines[0] || "");
    const body = lines.slice(1).join("\n").replace(/^\n+/, "");
    return {
      title: meta.a,
      published: meta.b,
      tags: parseTags(meta.c),
      body,
    };
  }

  function stripTrailingIgnoreBlock(body) {
    return body.replace(/\n-----\n\+{10}\n[\s\S]*$/, "");
  }

  function parseManual(text) {
    const normalized = text.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    const meta = splitMetaLine(lines[0] || "");
    let body = lines.slice(1).join("\n").replace(/^\n+/, "");
    body = stripTrailingIgnoreBlock(body);
    const chunks = body
      .split("\n" + SEP + "\n")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const tasks = [];
    for (const chunk of chunks) {
      const ls = chunk.split("\n");
      const taskName = ls[0] || "";
      const rest = ls.slice(1).join("\n");
      const parts = rest.split(/\n-----\n/);
      let overview = parts[0] || "";
      let detail = parts[1] || "";
      let script = parts[2] || "";
      script = script.replace(/\n-----\s*$/, "").replace(/-----\s*$/, "").trimEnd();
      tasks.push({
        name: taskName,
        overview: overview.trim(),
        detail: detail.trim(),
        script: script.trim(),
      });
    }
    return {
      eventName: meta.a,
      eventDate: meta.b,
      tags: parseTags(meta.c),
      tasks,
    };
  }

  function previewText(s, maxLines) {
    if (!s) return "";
    const lines = s.split("\n");
    if (lines.length <= maxLines) return s;
    return lines.slice(0, maxLines).join("\n") + "…";
  }

  function manualPreview(m) {
    const bits = [];
    for (const t of m.tasks) {
      bits.push(t.overview, t.detail, t.script);
    }
    return bits.filter(Boolean).join("\n");
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.json();
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(path + " " + res.status);
    return res.text();
  }

  function parseRoute() {
    const h = (location.hash || "#/").replace(/^#/, "");
    const parts = h.split("/").filter(Boolean);
    return { name: parts[0] || "home", id: parts[1] || null };
  }

  function setMobileMenu(open) {
    const menu = $("#mobileMenu");
    const btn = $("#menuToggle");
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tagsHtml(tags) {
    return tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  }

  function br(s) {
    return escapeHtml(s || "").replace(/\n/g, "<br/>");
  }

  function renderHome() {
    return `
      <section class="home-hero">
        <h1>委員会の共有ホーム</h1>
        <p>掲示板とマニュアルから選べます</p>
        <div class="home-actions">
          <a class="btn btn-primary" href="#/board">掲示板へ</a>
          <a class="btn btn-secondary" href="#/manual">マニュアルへ</a>
        </div>
      </section>`;
  }

  function renderBoardList(articles) {
    let html = `<div class="screen-title"><a class="icon-btn" href="#/" title="ホーム">⌂</a><h1>掲示板</h1></div>`;
    html += `<div class="timeline">`;
    for (const a of articles) {
      const tagHtml = tagsHtml(a.tags);
      const prev = escapeHtml(previewText(a.body, 3)).replace(/\n/g, "<br/>");
      const href = `#/board/${encodeURIComponent(a.id)}`;
      html += `<article class="card card-link" data-href="${href}" tabindex="0" role="link" aria-label="${escapeHtml(a.title)} を開く">
        <div class="card-meta">
          <h2 class="card-title">${escapeHtml(a.title)}</h2>
          <span class="card-date">${escapeHtml(a.published)}</span>
        </div>
        <div class="tags">${tagHtml}</div>
        <p class="body-preview">${prev}</p>
      </article>`;
    }
    html += `</div>`;
    return html;
  }

  function renderArticleDetail(a) {
    const tagHtml = tagsHtml(a.tags);
    const body = escapeHtml(a.body).replace(/\n/g, "<br/>");
    return `
      <div class="screen-title">
        <a class="icon-btn" href="#/board" title="掲示板へ">←</a>
        <h1>${escapeHtml(a.title)}</h1>
      </div>
      <p class="muted">${escapeHtml(a.published)}</p>
      <div class="tags" style="margin:0.5rem 0">${tagHtml}</div>
      <div class="article-body">${body}</div>`;
  }

  function renderManualList(manuals) {
    let html = `<div class="screen-title"><a class="icon-btn" href="#/" title="ホーム">⌂</a><h1>マニュアル</h1></div>`;
    html += `<div class="manual-grid">`;
    for (const m of manuals) {
      const tagHtml = tagsHtml(m.tags);
      const pv = escapeHtml(previewText(manualPreview(m), 3)).replace(/\n/g, "<br/>");
      const href = `#/manual/${encodeURIComponent(m.id)}`;
      html += `<article class="card manual-card card-link" data-href="${href}" tabindex="0" role="link" aria-label="${escapeHtml(m.eventName)} を開く">
        <div class="card-meta">
          <h2 class="card-title">${escapeHtml(m.eventName)}</h2>
          <span class="card-date">${escapeHtml(m.eventDate)}</span>
        </div>
        <div class="tags">${tagHtml}</div>
        <p class="card-preview">${pv}</p>
      </article>`;
    }
    html += `</div>`;
    return html;
  }

  function renderManualDetail(m) {
    const tagHtml = tagsHtml(m.tags);
    let blocks = "";
    for (const t of m.tasks) {
      blocks += `<div class="work-block">
        <h3>${escapeHtml(t.name)}</h3>
        <section><h4>作業概要</h4><div class="article-body">${br(t.overview)}</div></section>
        <section><h4>作業詳細</h4><div class="article-body">${br(t.detail)}</div></section>
        <section><h4>台詞</h4><div class="article-body">${br(t.script)}</div></section>
      </div>`;
    }
    return `
      <div class="screen-title">
        <a class="icon-btn" href="#/manual" title="一覧へ">←</a>
        <h1>${escapeHtml(m.eventName)}</h1>
      </div>
      <p class="muted">${escapeHtml(m.eventDate)}</p>
      <div class="tags" style="margin:0.5rem 0">${tagHtml}</div>
      <div class="manual-detail">${blocks}</div>`;
  }

  async function loadFromIndex(indexPath, baseDir, fileName, parse) {
    const ids = await fetchJson(indexPath);
    const list = [];
    for (const id of ids) {
      const text = await fetchText(`${baseDir}/${id}/${fileName}`);
      list.push({ id, ...parse(text) });
    }
    return list;
  }

  function loadArticles() {
    return loadFromIndex("articles.json", ARTICLES_DIR, "article.txt", parseArticle);
  }

  function loadManuals() {
    return loadFromIndex("manuals.json", MANUALS_DIR, "manual.txt", parseManual);
  }

  async function render() {
    const app = $("#app");
    const route = parseRoute();
    setMobileMenu(false);
    app.innerHTML = `<p class="muted">読み込み中…</p>`;
    try {
      if (route.name === "home" || route.name === "") {
        app.innerHTML = renderHome();
        return;
      }
      if (route.name === "board") {
        const articles = await loadArticles();
        if (!route.id) {
          app.innerHTML = renderBoardList(articles);
          return;
        }
        const id = decodeURIComponent(route.id);
        const a = articles.find((x) => x.id === id);
        app.innerHTML = a
          ? renderArticleDetail(a)
          : `<p class="error-box">記事が見つかりません</p>`;
        return;
      }
      if (route.name === "manual") {
        const manuals = await loadManuals();
        if (!route.id) {
          app.innerHTML = renderManualList(manuals);
          return;
        }
        const id = decodeURIComponent(route.id);
        const m = manuals.find((x) => x.id === id);
        app.innerHTML = m
          ? renderManualDetail(m)
          : `<p class="error-box">マニュアルが見つかりません</p>`;
        return;
      }
      app.innerHTML = `<p class="error-box">不明な画面です</p>`;
    } catch (e) {
      app.innerHTML = `<div class="error-box">読み込みに失敗しました: ${escapeHtml(e.message)}<br/><span class="muted">ローカルで開いている場合は簡易サーバー（例: npx serve）でルートを配信してください。</span></div>`;
    }
  }

  window.addEventListener("hashchange", render);
  document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest?.(".card-link");
      if (!el) return;
      const href = el.getAttribute("data-href");
      if (!href) return;
      location.hash = href.startsWith("#") ? href : "#" + href;
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const el = ev.target.closest?.(".card-link");
      if (!el) return;
      const href = el.getAttribute("data-href");
      if (!href) return;
      location.hash = href.startsWith("#") ? href : "#" + href;
    });
    $("#menuToggle")?.addEventListener("click", () => {
      const menu = $("#mobileMenu");
      setMobileMenu(menu.hidden);
    });
    document.querySelectorAll("[data-nav-home],[data-nav-board],[data-nav-manual]").forEach((el) => {
      el.addEventListener("click", () => setMobileMenu(false));
    });
    if (!location.hash) location.hash = "#/";
    render();
  });
})();
