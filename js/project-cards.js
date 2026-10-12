// Renders the Projects section from js/data/projects.js into #v2-project-cards.
import { PROJECTS } from "./data/projects.js";

const STATUS_LABEL = { shipped: "Shipped", "in-progress": "In progress", upcoming: "Upcoming" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function link(href, label) {
  const a = el("a", "v2-link selectable-item", label);
  a.href = href;
  if (!href.startsWith("/")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return a;
}

function buildCard(p) {
  const card = el("article", `v2-card v2-card--${p.status || "none"}`);
  card.dataset.projectId = p.id;
  const head = el("div", "v2-card__head");
  head.appendChild(el("h3", "v2-h3", p.title));
  const meta = el("div", "v2-card__meta");
  if (p.status) meta.appendChild(el("span", `v2-status v2-status--${p.status}`, STATUS_LABEL[p.status] || p.status));
  if (p.date) meta.appendChild(el("span", "v2-card__date", p.date));
  if (meta.childNodes.length) head.appendChild(meta);
  card.appendChild(head);
  if (p.summary) card.appendChild(el("p", "v2-caption", p.summary));
  if (p.tags && p.tags.length) {
    const tags = el("ul", "v2-tags");
    p.tags.forEach((t) => tags.appendChild(el("li", "v2-tag", t)));
    card.appendChild(tags);
  }
  const links = [];
  if (p.url) links.push(link(p.url, p.url.startsWith("/") ? "Open" : p.url.replace(/^https?:\/\/(www\.)?/, "")));
  (p.links || []).forEach((l) => links.push(link(l.href, l.label)));
  if (links.length) {
    const row = el("div", "v2-card__links");
    links.forEach((a) => row.appendChild(a));
    card.appendChild(row);
  }
  // p.media is reserved for a future expand-on-click view (not rendered yet).
  return card;
}

export function renderProjectCards(root = document.getElementById("v2-project-cards")) {
  if (!root) return;
  root.replaceChildren(...[...PROJECTS].sort((a, b) => a.order - b.order).map(buildCard));
}
