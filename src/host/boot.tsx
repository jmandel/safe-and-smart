import React from 'react';
import type {Root} from 'react-dom/client';
import {App} from './App';
import {bootstrapSmart} from './smart-launch';

// The wrapper performs a real SMART standalone launch for itself, then hands the
// resulting live transport + patient/clinician context to the broker. The applet
// only ever sees brokered capabilities — never the token.
export function bootSmart(root: Root) {
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
}
