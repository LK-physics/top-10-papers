(async function () {
  const statusBar = document.getElementById("status-bar");
  const statusText = document.getElementById("status-text");
  const errorBanner = document.getElementById("error-banner");
  const metaBar = document.getElementById("meta-bar");
  const lastUpdated = document.getElementById("last-updated");
  const timeframeBadge = document.getElementById("timeframe-badge");
  const summarySection = document.getElementById("summary-section");
  const summaryTrends = document.getElementById("summary-trends");
  const summaryRecs = document.getElementById("summary-recommendations");
  const papersList = document.getElementById("papers-list");
  const emptyState = document.getElementById("empty-state");

  // Show loading
  statusBar.classList.remove("hidden");

  try {
    const res = await fetch("data/papers.json");
    if (!res.ok) throw new Error(`Failed to load papers (HTTP ${res.status})`);
    const data = await res.json();

    // Hide loading
    statusBar.classList.add("hidden");

    // Show error banner if there was an update error but still have data
    if (data.error) {
      errorBanner.textContent = "Last update encountered an error: " + data.error;
      errorBanner.classList.remove("hidden");
    }

    // Meta bar
    if (data.generatedAt) {
      const date = new Date(data.generatedAt);
      lastUpdated.textContent = "Last updated: " + date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      timeframeBadge.textContent = "Last " + (data.timeframe || "7 days");
      metaBar.classList.remove("hidden");
    }

    // Summary
    if (data.summary) {
      if (data.summary.trends) {
        summaryTrends.textContent = data.summary.trends;
      }
      if (data.summary.recommendations) {
        summaryRecs.textContent = data.summary.recommendations;
      }
      if (data.summary.trends || data.summary.recommendations) {
        summarySection.classList.remove("hidden");
      }
    }

    // Papers
    if (!data.papers || data.papers.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }

    data.papers.forEach(function (paper) {
      const card = document.createElement("div");
      card.className = "paper-card";

      const actionsHtml = buildActions(paper);

      card.innerHTML =
        '<div class="paper-header">' +
          '<span class="paper-rank">' + escapeHtml(String(paper.rank)) + '</span>' +
          '<span class="paper-title">' +
            (paper.url
              ? '<a href="' + escapeAttr(paper.url) + '" target="_blank" rel="noopener">' + escapeHtml(paper.title) + '</a>'
              : escapeHtml(paper.title)) +
          '</span>' +
        '</div>' +
        '<div class="paper-meta">' +
          '<span><span class="meta-label">Authors:</span> ' + escapeHtml(paper.authors || "Unknown") + '</span>' +
          '<span><span class="meta-label">Source:</span> ' + escapeHtml(paper.source || "N/A") + '</span>' +
          '<span><span class="meta-label">Date:</span> ' + escapeHtml(paper.date || "N/A") + '</span>' +
        '</div>' +
        '<div class="paper-description">' + escapeHtml(paper.description || "") + '</div>' +
        actionsHtml;

      papersList.appendChild(card);
    });
  } catch (err) {
    statusBar.classList.add("hidden");
    errorBanner.textContent = err.message;
    errorBanner.classList.remove("hidden");
    emptyState.classList.remove("hidden");
  }

  function buildActions(paper) {
    let html = '<div class="paper-actions">';
    if (paper.url) {
      html += '<a class="btn-link btn-view" href="' + escapeAttr(paper.url) + '" target="_blank" rel="noopener">View</a>';
    }
    if (paper.downloadUrl) {
      html += '<a class="btn-link btn-download" href="' + escapeAttr(paper.downloadUrl) + '" target="_blank" rel="noopener">PDF</a>';
    }
    html += '</div>';
    return html;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
