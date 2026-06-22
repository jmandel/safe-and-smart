import React from 'react';
import type {Root} from 'react-dom/client';
import {App} from './App';
import {bootstrapSmart, isSmartMode} from './smart-launch';

// Boots the trusted wrapper runtime. A real SMART standalone launch when
// ?fhir=smart (or returning from one), otherwise the open-endpoint demo. The
// applet to run is chosen by ?applet=<url> / the picker; with neither, the
// default applet bundle is loaded. The applet only ever sees brokered
// capabilities — never the token.
export function boot(root: Root) {
  if (isSmartMode()) {
    root.render(<div className="boot-card">Launching via SMART…</div>);
    bootstrapSmart()
      .then((smartInit) => root.render(<App smartInit={smartInit} />))
      .catch((error) =>
        root.render(
          <div className="boot-card" role="alert">
            SMART launch failed: {error instanceof Error ? error.message : String(error)}
            <br />
            <a href={import.meta.env.BASE_URL}>← back to start</a>
          </div>,
        ),
      );
  } else {
    root.render(<App />);
  }
}
