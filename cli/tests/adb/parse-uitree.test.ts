import { describe, it, expect } from 'vitest';
import { parseUiTreeXml } from '../../src/adb/parse-uitree.js';
import { SAMPLE_UI_TREE_XML } from '../helpers/fixtures.js';

describe('parseUiTreeXml', () => {
  it('parses the hierarchy rotation', () => {
    const tree = parseUiTreeXml(SAMPLE_UI_TREE_XML);
    expect(tree.rotation).toBe(0);
  });

  it('parses root + children', () => {
    const tree = parseUiTreeXml(SAMPLE_UI_TREE_XML);
    expect(tree.root.class).toBe('android.widget.FrameLayout');
    expect(tree.root.children).toHaveLength(2);
    const loginBtn = tree.root.children[1];
    expect(loginBtn?.text).toBe('Login');
    expect(loginBtn?.resourceId).toBe('com.example.app:id/login_btn');
    expect(loginBtn?.clickable).toBe(true);
    expect(loginBtn?.contentDesc).toBe('Login button');
    expect(loginBtn?.bounds).toEqual({ left: 100, top: 400, right: 980, bottom: 500 });
  });

  it('handles empty input gracefully', () => {
    expect(() => parseUiTreeXml('')).toThrow(/empty/i);
  });

  it('handles malformed XML', () => {
    expect(() => parseUiTreeXml('<not-xml')).toThrow();
  });
});
