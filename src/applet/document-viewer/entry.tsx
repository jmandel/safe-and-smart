// Acceptance applet: display a document the applet already holds the bytes for.
// A FHIR Attachment usually carries its content inline as base64 `data` plus a
// `contentType`; the applet builds a self-contained `data:` URL and renders it with
// <ui-image>. There is no "fetch this URL for me" capability — a data: URL makes no
// network request, so there is nothing to exfiltrate. <Image src> accepts data:
// URLs only; a remote src is rejected by the host firewall.
import {runApplet, type AppletProps} from '../runtime';
import {Stack, Heading, Text, Image} from '../remote-elements';

// Stand-in for an inline FHIR Attachment ({contentType, data}). In a real applet
// these bytes come from a resource read via session.smart (e.g. Attachment.data).
const contentType = 'image/svg+xml';
const data = btoa(
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='170' viewBox='0 0 320 170'>" +
    "<rect width='320' height='170' rx='10' fill='#0f172a'/>" +
    "<text x='22' y='44' fill='#e2e8f0' font-family='sans-serif' font-size='15'>Discharge summary</text>" +
    "<text x='22' y='78' fill='#94a3b8' font-family='sans-serif' font-size='11'>Inline attachment bytes — shown directly.</text>" +
    "<text x='22' y='100' fill='#64748b' font-family='sans-serif' font-size='10'>No URL, no token, no network request.</text>" +
    '</svg>',
);
const dataUrl = `data:${contentType};base64,${data}`;

function DocumentViewer(_props: AppletProps) {
  return (
    <Stack gap={12}>
      <Heading level={2}>Inline document</Heading>
      <Text tone="muted">
        The applet already holds the bytes (inline Attachment data) and renders them as a self-contained data: URL —
        nothing is fetched.
      </Text>
      <Image src={dataUrl} alt="Discharge summary" />
    </Stack>
  );
}

runApplet(DocumentViewer, {appletId: 'org.example.document-viewer', appletVersion: '0.1.0'});
