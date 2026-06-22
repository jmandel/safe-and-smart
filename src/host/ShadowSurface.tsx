import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

// Renders the applet subtree inside a contained (open) ShadowRoot. The applet
// itself runs in a worker with no DOM access, and the host mutation firewall is
// the security boundary; this shadow root adds DOM/CSS *scope* containment so the
// vetted applet components live in their own tree — wrapper-chrome selectors and
// the applet subtree can't reach into each other, and a future renderer can't
// escape the surface via document-wide CSS. Document stylesheets are adopted into
// the shadow root so the remote-* component styles still apply.
function adoptDocumentStyles(root: ShadowRoot): void {
  try {
    const sheet = new CSSStyleSheet();
    for (const styleSheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = styleSheet.cssRules; // same-origin sheets only; cross-origin throws
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) sheet.insertRule(rule.cssText, sheet.cssRules.length);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  } catch {
    // Constructable stylesheets unavailable — fall back to a cloned <style> below.
    const style = document.createElement('style');
    style.textContent = Array.from(document.styleSheets)
      .flatMap((s) => {
        try {
          return Array.from(s.cssRules).map((r) => r.cssText);
        } catch {
          return [];
        }
      })
      .join('\n');
    root.append(style);
  }
}

export function ShadowSurface({
  children,
  appletStyles = [],
}: {
  children: React.ReactNode;
  // Validated applet CSS (from clinical.registerStylesheet). Installed into the
  // shadow root, so it is scoped to the applet surface and cannot restyle the
  // trusted wrapper chrome outside it.
  appletStyles?: readonly string[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement>();
  const styleElement = useRef<HTMLStyleElement>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({mode: 'open'});
    adoptDocumentStyles(root);
    const style = document.createElement('style');
    style.dataset.appletStyles = 'true';
    root.append(style);
    styleElement.current = style;
    const container = document.createElement('div');
    container.className = 'applet-shadow-root';
    root.append(container);
    setMount(container);
    return () => {
      container.remove();
      style.remove();
    };
  }, []);

  // Applet stylesheets are validated host-side (CSS validator) before they arrive;
  // we concatenate them into the shadow-scoped <style>. Scoping is the shadow
  // boundary — these rules cannot reach the wrapper chrome.
  useEffect(() => {
    if (styleElement.current) styleElement.current.textContent = appletStyles.join('\n');
  }, [appletStyles]);

  return (
    <div ref={hostRef} className="applet-shadow-host">
      {mount ? createPortal(children, mount) : null}
    </div>
  );
}
