// W5 acceptance applet: streaming LLM + a broker-executed tool. Uses the
// OpenAI-compatible llm.internal bridge with stream:true and consumes the SSE
// deltas, rendering the summary progressively. The 'note-summarizer' profile makes
// the broker invoke the allowlisted getLatestVitals tool (a scoped FHIR read the
// applet never performs) and fold the result into the generation.
import {useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';
import {Stack, Heading, Text, Button, Card, Badge} from '../remote-elements';

function NoteSummarizer({session}: AppletProps) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState(0);

  const run = async () => {
    setBusy(true);
    setSummary('');
    setTokens(0);
    try {
      const response = await fetch('https://llm.internal/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'note-summarizer',
          stream: true,
          messages: [{role: 'user', content: `Summarize recent notes for ${session.smart.patient.display}`}],
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('no stream');
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const match = part.match(/^data: (.*)$/m);
          if (!match || match[1] === '[DONE]') continue;
          try {
            const json = JSON.parse(match[1]!);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              setSummary((s) => s + delta);
              setTokens((n) => n + 1);
            }
          } catch {
            /* ignore keep-alive / partial */
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={12}>
      <Stack gap={4}>
        <Heading level={2}>Note summarizer (streaming)</Heading>
        <Text tone="muted">Patient: {session.smart.patient.display}</Text>
      </Stack>
      <Stack gap={8} direction="row" align="center">
        <Button variant="primary" disabled={busy} onPress={run}>
          {busy ? 'Streaming…' : 'Summarize'}
        </Button>
        {tokens > 0 ? <Badge tone="info">{tokens} chunks</Badge> : null}
      </Stack>
      <Card padding={16}>
        <Text>{summary || 'Press Summarize to stream a summary (with a brokered FHIR tool call).'}</Text>
      </Card>
    </Stack>
  );
}

runApplet(NoteSummarizer, {appletId: 'org.example.note-summarizer', appletVersion: '0.1.0'});
