// W7 acceptance applet: display a token-protected attachment via an opaque handle.
// The applet asks the broker to fetch the attachment; it gets back only a handle
// (never the URL or token) and renders it with <ui-image>. The host resolves the
// handle to a blob: URL it minted.
import {useEffect, useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {Stack, Heading, Text, Image, Alert} from '../remote-elements';

function DocumentViewer({session}: AppletProps) {
  const [handle, setHandle] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    session.files
      .open({url: 'demo:discharge-summary', title: 'Discharge summary'})
      .then((r) => (r.ok ? setHandle(r.handle) : setError(r.error)));
  }, [session]);

  return (
    <Stack gap={12}>
      <Heading level={2}>Protected document</Heading>
      <Text tone="muted">Rendered from an opaque handle — the applet never sees the URL or token.</Text>
      {error ? <Alert tone="danger" title="Unavailable">{error}</Alert> : null}
      {handle ? <Image handle={handle} alt="Discharge summary (protected)" /> : null}
    </Stack>
  );
}

runApplet(DocumentViewer, {appletId: 'org.example.document-viewer', appletVersion: '0.1.0'});
