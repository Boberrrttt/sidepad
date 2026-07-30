import { marked } from 'marked';
import { isGithubAssetUrl } from '@/app/shared/github-assets';

export function toHtml(markdown: string) {
  return String(marked.parse(markdown, { async: false }));
}

export async function toGithubHtml(markdown: string, projectId: string | null) {
  let html = toHtml(markdown || '');
  if (!projectId) return html;

  const urls = new Set<string>();
  for (const match of html.matchAll(/\bsrc="(https:\/\/[^"]+)"/gi)) {
    const src = match[1];
    if (src && isGithubAssetUrl(src)) urls.add(src);
  }

  for (const assetUrl of urls) {
    try {
      const response = await fetch('/api/integrations/github/asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, url: assetUrl }),
      });

      if (!response.ok) continue;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      html = html.split(assetUrl).join(objectUrl);
    } catch {
    }
  }

  return html;
}

function wrapMd(marker: string, inner: string): string {
  if (!inner) return '';

  if (marker === '*' && inner.startsWith('**') && inner.endsWith('**')) {
    return `*${inner}*`;
  }

  if (inner.startsWith(marker) && inner.endsWith(marker)) return inner;

  return `${marker}${inner}${marker}`;
}

export function htmlToMd(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const childMarkdown = () =>
      Array.from(element.childNodes).map(walk).join('');

    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return wrapMd('**', childMarkdown());
    if (tag === 'em' || tag === 'i') return wrapMd('*', childMarkdown());
    if (tag === 'u') return `<u>${childMarkdown()}</u>`;
    if (tag === 's' || tag === 'strike' || tag === 'del')
      return wrapMd('~~', childMarkdown());
    if (tag === 'code') {
      return element.parentElement?.tagName.toLowerCase() === 'pre'
        ? childMarkdown()
        : `\`${childMarkdown()}\``;
    }
    if (tag === 'pre') return `\`\`\`\n${childMarkdown()}\n\`\`\`\n\n`;
    if (tag === 'h1') return `# ${childMarkdown().trim()}\n\n`;
    if (tag === 'h2') return `## ${childMarkdown().trim()}\n\n`;
    if (tag === 'h3') return `### ${childMarkdown().trim()}\n\n`;
    if (tag === 'p' || tag === 'div') {
      const text = childMarkdown();
      return text ? `${text.replace(/\n$/, '')}\n\n` : '';
    }
    if (tag === 'li') return `- ${childMarkdown().trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `${childMarkdown()}\n`;
    if (tag === 'a') {
      return `[${childMarkdown()}](${element.getAttribute('href') || ''})`;
    }
    if (tag === 'img') {
      const alt = element.getAttribute('alt') || '';
      const src = element.getAttribute('src') || '';
      return src ? `![${alt}](${src})` : '';
    }

    return childMarkdown();
  }

  return Array.from(root.childNodes)
    .map(walk)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
