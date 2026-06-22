import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {bootstrapSmart, isSmartMode} from './smart-launch';
import './styles.css';

// app.html — the trusted wrapper runtime. Boots an applet directly: a real SMART
// standalone launch when ?fhir=smart (or returning from one), otherwise the
// open-endpoint demo. The applet to run is chosen by ?applet=<url> / the picker;
// with neither, the built-in applet runs.
const container = document.getElementById('root');
if (!container) throw new Error('Host root element is missing.');
const root = createRoot(container);

if (isSmartMode()) {
  // The wrapper performs the SMART launch for itself, then hands the resulting
  // live transport + patient/clinician context to the broker. The applet still
  // only ever sees brokered capabilities — never the token.
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
