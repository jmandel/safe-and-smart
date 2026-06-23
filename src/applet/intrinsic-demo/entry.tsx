/** @jsxImportSource ../safe-react */
// Gate applet for Phase 2: a small form-style app written entirely with intrinsic
// <ui-*> TSX and familiar React event code — NO Remote DOM / remote-elements
// imports. The @safe-smart/react JSX runtime maps each ui-* tag to its event-wired
// bound component, and the generated safe-dom-intrinsics.d.ts gives full
// type-checking. This demonstrates that an author needs only React + intrinsic JSX.
import {useState} from 'react';
import {runApplet, type AppletProps} from '../runtime';

const PRIORITIES = [
  {label: 'Routine', value: 'routine'},
  {label: 'Urgent', value: 'urgent'},
  {label: 'Stat', value: 'stat'},
];

function IntrinsicDemo({session}: AppletProps) {
  const [priority, setPriority] = useState('routine');
  const [filed, setFiled] = useState(false);

  const file = () => {
    setFiled(true);
    void session.audit({
      kind: 'application',
      code: 'applet.user-action',
      message: `intrinsic-demo: filed ${priority} follow-up note`,
    });
  };

  return (
    <ui-stack gap={16}>
      <ui-card tone="default" padding={20}>
        <ui-stack gap={8}>
          <ui-heading level={2}>Quick follow-up</ui-heading>
          <ui-text tone="muted">
            Patient: {session.smart.patient.display} · written with intrinsic {'<ui-*>'} JSX, no Remote DOM imports.
          </ui-text>
          <ui-badge tone={session.probe.directNetworkBlocked ? 'positive' : 'critical'}>
            network {session.probe.directNetworkBlocked ? 'blocked' : 'OPEN'}
          </ui-badge>
        </ui-stack>
      </ui-card>

      <ui-card padding={20}>
        <ui-stack gap={12}>
          <ui-select
            label="Priority"
            value={priority}
            options={PRIORITIES}
            onChange={(event: any) => setPriority(String(event.detail.value))}
          />
          <ui-text size="small" tone="muted">
            Selected priority: {priority}
          </ui-text>
          <ui-button
            variant="primary"
            disabled={filed}
            onPress={file}
            onKeyDown={(event: any) => {
              if (event.detail?.key === 'Enter') file();
            }}
          >
            {filed ? 'Filed for clinician review' : 'File follow-up'}
          </ui-button>
        </ui-stack>
      </ui-card>
    </ui-stack>
  );
}

runApplet(IntrinsicDemo, {appletId: 'org.example.intrinsic-demo', appletVersion: '0.1.0'});
