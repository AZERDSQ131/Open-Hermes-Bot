import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetHeader } from './UI';
import { C, INK, createStyles } from '../theme';

/**
 * The camera, pointed at the QR the desktop window draws.
 *
 * The desktop holds the way to the host, so it is the one that can mint the
 * bridge's code; the phone cannot type what it does not have. One picture
 * carries both halves of the pairing — the tailnet address and the code — and
 * reading it is the whole gesture.
 */
export function PairingScanner({
  visible,
  onClose,
  onRead,
}: {
  visible: boolean;
  onClose: () => void;
  onRead: (value: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [refused, setRefused] = useState(false);
  // A camera reads the same code many times a second. The first read is the
  // one that counts: the hands that follow it are the same picture.
  const seen = useRef(false);

  const allowed = permission?.granted === true;

  function read(value: string) {
    if (seen.current) return;
    seen.current = true;
    onRead(value);
  }

  function close() {
    seen.current = false;
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
        <SheetHeader title="Scan the code" sub="From the desktop app: Settings → Phone" onClose={close} />

        {Platform.OS === 'web' ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>The browser has no camera here</Text>
            <Text style={styles.noticeCopy}>
              Paste the link from the desktop instead, in the Address field.
            </Text>
          </View>
        ) : allowed ? (
          <View style={styles.viewport}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => read(data)}
            />
            <View pointerEvents="none" style={styles.frame} />
            <Text style={styles.caption}>
              Point it at the QR in the desktop window.
            </Text>
          </View>
        ) : (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {refused || permission?.canAskAgain === false
                ? 'The camera is not allowed'
                : 'The camera opens for this'}
            </Text>
            <Text style={styles.noticeCopy}>
              {refused || permission?.canAskAgain === false
                ? 'Allow the camera in Settings, or paste the link from the desktop in the Address field.'
                : 'Reading the code is the only thing the camera is used for. Nothing is kept.'}
            </Text>
            {refused || permission?.canAskAgain === false ? null : (
              <Pressable
                style={styles.allow}
                accessibilityRole="button"
                onPress={async () => {
                  const answer = await requestPermission();
                  setRefused(!answer.granted);
                }}
              >
                <Text style={styles.allowText}>Allow the camera</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = createStyles({
  root: { flex: 1, backgroundColor: C.bg },
  viewport: { flex: 1, padding: 12 },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  frame: {
    position: 'absolute',
    top: '22%',
    left: '18%',
    right: '18%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'rgba(242,239,229,0.85)',
    borderRadius: 18,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
    color: C.text,
    fontSize: 12,
    textAlign: 'center',
  },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  noticeTitle: { color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  noticeCopy: { color: INK.quiet, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  allow: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.paper,
  },
  allowText: { color: INK.onPaper, fontSize: 12, fontWeight: '600' },
});
