import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Page } from '../components/Page';
import { Card, Field, Hint, PrimaryButton, Row, SectionLabel } from '../components/UI';
import { BridgeError } from '../api';
import { useStore } from '../store';
import { C, INK, createStyles } from '../theme';

/**
 * The door, with its address and its code.
 *
 * The phone reaches the bridge the same way a browser would: over the tailnet,
 * at an HTTPS address. This page is where that address is typed, where the
 * one-time code is exchanged for this phone's token, and where the devices
 * that hold one can be forgotten.
 */
export function ConnectionScreen() {
  const { connection, connect, disconnect, devices, revokeDevice, refresh, prefs } = useStore();
  const [url, setUrl] = useState(connection.url);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const online = connection.status === 'connected';
  const working = busy || connection.status === 'connecting';

  async function pair() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await connect(url, code);
      setCode('');
      setNotice('Paired. The bots below come from Hermes, not from this phone.');
    } catch (failure) {
      setError(
        failure instanceof BridgeError
          ? failure.message
          : 'The bridge could not be reached.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Connection">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              connection.status === 'error' && styles.dotBad,
              !online && connection.status !== 'error' && styles.dotOff,
            ]}
          />
          <Text style={styles.statusText}>
            {online
              ? `Connected · ${connection.device || 'this phone'}${connection.health ? ` · bridge ${connection.health.version}` : ''}`
              : connection.status === 'connecting'
                ? 'Connecting…'
                : connection.status === 'error'
                  ? 'Not connected · the bridge refused or did not answer'
                  : 'Not connected · nothing answers yet'}
          </Text>
        </View>

        {online ? (
          <>
            <SectionLabel>The bridge</SectionLabel>
            <Card>
              <Row name="Address" value={connection.url.replace(/^https?:\/\//i, '')} chevron={false} />
              <View style={styles.line} />
              <Row
                name="Hermes"
                value={connection.health?.hermes.ok ? 'answering' : 'not answering'}
                valueColor={connection.health?.hermes.ok ? '#7fcfaa' : '#e09248'}
                chevron={false}
              />
              <View style={styles.line} />
              <Row name="Model" value={connection.model || 'the host default'} chevron={false} />
              <View style={styles.line} />
              <Row name="On the host" value={prefs.host} chevron={false} />
            </Card>

            <View style={styles.buttons}>
              <PrimaryButton
                label={busy ? 'Reading…' : 'Read it again'}
                tone="quiet"
                onPress={async () => {
                  setError('');
                  setBusy(true);
                  try {
                    await refresh();
                    setNotice('Read again from Hermes.');
                  } catch {
                    setError('The bridge did not answer.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <View style={styles.gap} />
              <PrimaryButton label="Disconnect this phone" tone="quiet" onPress={() => void disconnect()} />
            </View>

            <SectionLabel>Devices</SectionLabel>
            <Card>
              {devices.length === 0 ? (
                <Row name="No device paired" value="" chevron={false} />
              ) : (
                devices.map((device, index) => (
                  <Row
                    key={device.id}
                    name={device.name}
                    meta={device.id}
                    line={index > 0}
                    right={
                      <Pressable onPress={() => void revokeDevice(device.id)} accessibilityLabel={`Revoke ${device.name}`}>
                        <Text style={styles.revoke}>Revoke</Text>
                      </Pressable>
                    }
                    chevron={false}
                  />
                ))
              )}
            </Card>
            <Hint>
              Revoking a device takes its token away for good. Its Hermes keys were never on it:
              the bridge reads them here, on the host.
            </Hint>
          </>
        ) : (
          <>
            <SectionLabel>Bridge</SectionLabel>
            <Card>
              <View style={styles.card}>
                <Field
                  label="Address"
                  value={url}
                  onChange={setUrl}
                  placeholder="https://host.tailnet.ts.net"
                />
                <Field
                  label="Pairing code"
                  value={code}
                  onChange={setCode}
                  placeholder="ABCD-EFGH"
                />
              </View>
            </Card>

            <View style={styles.buttons}>
              <PrimaryButton
                label={working ? 'Pairing…' : 'Pair this phone'}
                onPress={() => void pair()}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {connection.error && !error ? <Text style={styles.error}>{connection.error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Hint>
              The address is the bridge on the machine that runs Hermes, published by Tailscale.
              The phone must be on the same tailnet. On the host, a code is minted with
              `python3 -m hermes_bridge pair`; it works once, and for twenty minutes.
            </Hint>
            <Hint>
              Nothing about the conversations is kept here. The token this page earns opens the
              bridge and nothing else.
            </Hint>

            <SectionLabel>State</SectionLabel>
            <Card>
              <Row name="This phone" value={connection.device || 'not paired'} chevron={false} />
              <View style={styles.line} />
              <Row name="Host" value={prefs.host} chevron={false} />
            </Card>
          </>
        )}
      </ScrollView>
    </Page>
  );
}

const styles = createStyles({
  body: { paddingHorizontal: 12, paddingBottom: 24 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  dotOff: { backgroundColor: INK.label },
  dotBad: { backgroundColor: '#e09248' },
  statusText: { flex: 1, color: '#a4a4ab', fontSize: 11 },
  card: { padding: 12, gap: 2 },
  buttons: { marginTop: 16 },
  gap: { height: 8 },
  line: { height: 1, backgroundColor: C.hairline },
  error: { marginTop: 10, color: '#e09248', fontSize: 11, lineHeight: 16 },
  notice: { marginTop: 10, color: '#7fcfaa', fontSize: 11, lineHeight: 16 },
  revoke: { color: '#e09248', fontSize: 11 },
});
