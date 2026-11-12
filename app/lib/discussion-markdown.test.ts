import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { renderDiscussionMarkdown } from "./discussion-markdown.server";

describe("discussion Markdown", () => {
  it("renders readable paragraphs, lists, links, quotes, and escaped code", () => {
    const html = renderDiscussionMarkdown(
      "**Why?**\n\n- One\n- Two\n\n> A quote\n\n[Docs](https://example.com/guide)\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n`<script>`"
    );
    const document = new JSDOM(html).window.document;
    expect(document.querySelector("strong")?.textContent).toBe("Why?");
    expect(document.querySelectorAll("li")).toHaveLength(2);
    expect(document.querySelector("blockquote")?.textContent?.trim()).toBe(
      "A quote"
    );
    expect(document.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/guide"
    );
    expect(document.querySelector("a")?.getAttribute("rel")).toContain("ugc");
    expect(document.querySelector("pre code")?.textContent?.trim()).toBe(
      "<img src=x onerror=alert(1)>"
    );
    expect(document.querySelector("img, script")).toBeNull();
  });

  it.each([
    '<script>alert(1)</script><img src=x onerror="alert(1)">',
    '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><style>body{display:none}</style>',
    '<a href="javascript:alert(1)" onclick="alert(1)">click</a>',
    "[bad](javascript:alert%281%29) [bad](data:text/html,hello) [bad](vbscript:alert%281%29)",
    "[bad](javascript&#58;alert%281%29) [bad](java&#x09;script:alert%281%29)",
    "[bad](//example.com) ![image](https://example.com/image.png)",
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
  ])("does not turn untrusted input into active HTML: %s", (source) => {
    const html = renderDiscussionMarkdown(source);
    const document = new JSDOM(html).window.document;
    expect(
      document.querySelector(
        "script,img,svg,iframe,style,math,object,embed,input,form"
      )
    ).toBeNull();
    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toMatch(/^on|^style$|^srcdoc$/i);
      }
      const href = element.getAttribute("href");
      if (href)
        expect(href).not.toMatch(/^(?:javascript|vbscript|data):|^\/\//i);
    }
  });
});
