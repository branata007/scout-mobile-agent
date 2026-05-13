export interface UiTreeNode {
  index: number;
  class: string;
  text: string;
  resourceId: string;
  package: string;
  contentDesc: string;
  clickable: boolean;
  enabled: boolean;
  focused: boolean;
  selected: boolean;
  bounds: { left: number; top: number; right: number; bottom: number };
  children: UiTreeNode[];
}

export interface UiTree {
  rotation: number;
  root: UiTreeNode;
}

const ATTR_RE = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
const SELF_CLOSING_RE = /<node[^>]*\/>/;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function parseBounds(s: string): UiTreeNode['bounds'] {
  const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(s);
  if (!m) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: parseInt(m[1]!, 10),
    top: parseInt(m[2]!, 10),
    right: parseInt(m[3]!, 10),
    bottom: parseInt(m[4]!, 10),
  };
}

function makeNode(attrs: Record<string, string>): UiTreeNode {
  return {
    index: parseInt(attrs.index ?? '0', 10),
    class: attrs.class ?? '',
    text: attrs.text ?? '',
    resourceId: attrs['resource-id'] ?? '',
    package: attrs.package ?? '',
    contentDesc: attrs['content-desc'] ?? '',
    clickable: attrs.clickable === 'true',
    enabled: attrs.enabled === 'true',
    focused: attrs.focused === 'true',
    selected: attrs.selected === 'true',
    bounds: parseBounds(attrs.bounds ?? '[0,0][0,0]'),
    children: [],
  };
}

export function parseUiTreeXml(xml: string): UiTree {
  if (!xml.trim()) throw new Error('empty UI tree XML');
  if (!xml.includes('<hierarchy')) throw new Error('not a uiautomator dump (no <hierarchy>)');

  const hierMatch = /<hierarchy\b([^>]*)>/.exec(xml);
  if (!hierMatch) throw new Error('malformed XML: no <hierarchy> open tag');
  const rotation = parseInt(parseAttrs(hierMatch[1]!).rotation ?? '0', 10);

  type Token = { kind: 'open' | 'close'; node?: UiTreeNode };
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const openIdx = xml.indexOf('<node', pos);
    const closeIdx = xml.indexOf('</node>', pos);
    if (openIdx === -1 && closeIdx === -1) break;
    if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
      const endOfTag = xml.indexOf('>', openIdx);
      if (endOfTag === -1) throw new Error('malformed XML: unterminated <node>');
      const tagContent = xml.slice(openIdx, endOfTag + 1);
      const node = makeNode(parseAttrs(tagContent));
      tokens.push({ kind: 'open', node });
      if (SELF_CLOSING_RE.test(tagContent)) tokens.push({ kind: 'close' });
      pos = endOfTag + 1;
    } else {
      tokens.push({ kind: 'close' });
      pos = closeIdx + '</node>'.length;
    }
  }

  if (tokens.length === 0 || tokens[0]!.kind !== 'open') {
    throw new Error('malformed XML: no <node> elements');
  }

  const root = tokens[0]!.node!;
  const stack: UiTreeNode[] = [root];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'open') {
      stack[stack.length - 1]!.children.push(t.node!);
      stack.push(t.node!);
    } else {
      stack.pop();
    }
  }

  return { rotation, root };
}
