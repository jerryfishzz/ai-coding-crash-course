import { Marked, Renderer } from "marked";
import sanitizeHtml from "sanitize-html";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const renderer = new Renderer();
renderer.html = ({ text }) => escapeHtml(text);
renderer.image = () => "";
renderer.code = ({ text }) => `<pre><code>${escapeHtml(text)}</code></pre>\n`;
const markdown = new Marked({ renderer, async: false });

// User-authored posts have a deliberately smaller policy than authored lessons.
export function renderDiscussionMarkdown(source: string): string {
  return sanitizeHtml(markdown.parse(source) as string, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "pre",
      "code",
      "hr",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ],
    allowedAttributes: { a: ["href", "title", "rel"], ol: ["start"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "nofollow ugc noopener noreferrer",
      }),
    },
  });
}
