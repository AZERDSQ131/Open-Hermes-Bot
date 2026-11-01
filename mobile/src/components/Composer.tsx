import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Attachment, Bot, MessageKind, Thread } from '../data';
import { dictationAvailable, startDictation, type Dictation } from '../dictation';
import { ATTACHMENTS } from '../data';
import { C, INK, box, createStyles } from '../theme';
import { ArrowUpIcon, AttachIcon, CameraIcon, CloseIcon, FileIcon, MicIcon, PhotoIcon } from './Icons';
import { Sheet } from './Sheet';
import { GlassButton, GlassSurface } from './GlassButton';
import { Bloub } from './Bloub';
import { Row, SheetHeader } from './UI';

/** How many bars the live waveform keeps on screen. */
const BARS = 18;

function clock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export type Outgoing = {
  text: string;
  kind?: MessageKind;
  attachment?: Attachment;
  duration?: string;
  /** Said rather than typed: the bubble keeps it in italics. */
  dictated?: boolean;
};

type ComposerProps = {
  thread: Thread;
  bots: Bot[];
  onSend: (payload: Outgoing) => void;
};

/**
 * What a person types into, attaches through, and dictates into. Everything
 * it offers answers: a file becomes a message, the microphone becomes a
 * voice note, and an @ opens the roster of the round.
 */
export function Composer({ thread, bots, onSend }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  // A phone with no recogniser cannot write what it hears; the strip says so
  // rather than leaving the person talking to a closed microphone.
  const canHear = useMemo(() => dictationAvailable(), []);
  const [seconds, setSeconds] = useState(0);
  const [attaching, setAttaching] = useState(false);
  // What the phone is hearing, and whether the sentence in the field came out
  // of the microphone rather than the keyboard.
  const [heard, setHeard] = useState('');
  const [dictated, setDictated] = useState(false);
  const [refusal, setRefusal] = useState('');
  const listening = useRef<Dictation | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.1));
  // What the composer says once the microphone is closed and there is nothing
  // to show for it.
  const [aside, setAside] = useState('');

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // The bars say the microphone is open, and they are drawn here rather than
  // read from the recorder: the recogniser owns the microphone now, and two
  // readers on it is what used to leave both with nothing.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      setLevels((current) => {
        const last = current[current.length - 1] ?? 0.2;
        const next = Math.max(0.08, Math.min(0.9, last + (Math.random() - 0.5) * 0.55));
        return [...current.slice(1), next];
      });
    }, 90);
    return () => clearInterval(timer);
  }, [recording]);

  // A screen left while recording does not keep the microphone open.
  useEffect(
    () => () => {
      listening.current?.stop();
      listening.current = null;
    },
    [],
  );

  function startRecording() {
    setSeconds(0);
    setLevels(Array(BARS).fill(0.1));
    setHeard('');
    setDictated(false);
    setRefusal('');
    setAside('');
    listening.current = startDictation(setHeard, (reason) =>
      setRefusal(
        reason === 'refused'
          ? 'The microphone was refused · allow it, then dictate again'
          : 'No words came through · check the connection to the recogniser',
      ),
    );
    setRecording(true);
  }

  function stopRecording(keep: boolean) {
    const settled = listening.current?.stop() ?? '';
    listening.current = null;
    setRecording(false);

    // Stopping writes: the words go into the field, where they can be read,
    // corrected, and sent like anything typed. Nothing is sent from here.
    const said = (settled || heard).trim();
    setHeard('');
    if (!keep) return;
    if (!said) {
      setAside(refusal || 'Nothing was heard · try again');
      return;
    }
    setAside('');
    setDraft((current) => (current.trim() ? `${current.trim()} ${said}` : said));
    setDictated(true);
  }

  const members = useMemo(
    () =>
      (thread.members ?? [])
        .map((id) => bots.find((bot) => bot.id === id))
        .filter(Boolean) as Bot[],
    [bots, thread.members],
  );

  // The roster opens on an @ that names nobody yet.
  const query = /(?:^|\s)@(\w*)$/.exec(draft)?.[1];
  const roster =
    query === undefined
      ? []
      : members.filter((bot) => bot.name.toLowerCase().startsWith(query.toLowerCase()));

  function insert(bot: Bot) {
    setDraft((current) => current.replace(/@(\w*)$/, `@${bot.name} `));
  }

  function send() {
    if (!draft.trim()) return;
    onSend({ text: draft, dictated });
    setDraft('');
    setDictated(false);
  }

  if (recording) {
    return (
      <View style={styles.dock}>
        <View style={styles.recorder}>
          <Pressable
            style={[styles.round, styles.cancel]}
            onPress={() => stopRecording(false)}
            accessibilityLabel="Cancel dictation"
          >
            <CloseIcon size={15} color="#d8c9cb" />
          </Pressable>
          <View style={styles.waveform}>
            {levels.map((level, index) => (
              <View key={index} style={[styles.bar, { height: 5 + level * 25 }]} />
            ))}
          </View>
          <Text style={styles.time}>{clock(seconds)}</Text>
          <Pressable
            style={styles.stop}
            accessibilityLabel="Stop dictating"
            onPress={() => stopRecording(true)}
          >
            <View style={styles.stopGlyph} />
          </Pressable>
        </View>
        <Text style={styles.note} numberOfLines={2}>
          {!canHear
            ? 'No speech recogniser on this phone · the words cannot be written'
            : refusal ||
              heard ||
              'Listening · the words are transcribed here, the audio is not kept'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.dock}>
      <View>
        {roster.length > 0 ? (
          <View style={styles.roster}>
            {roster.map((bot, index) => (
              <Pressable
                key={bot.id}
                style={[styles.option, index === 0 && styles.optionActive]}
                onPress={() => insert(bot)}
              >
                <Bloub shape={bot.shape} color={bot.color} size={18} />
                <Text style={styles.optionName}>{bot.name}</Text>
                <Text style={styles.optionRole}>{bot.role}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <GlassSurface style={styles.composer}>
          <GlassButton
            size={box(37)}
            tint={C.field2}
            label="Attach a file"
            onPress={() => setAttaching(true)}
          >
            <AttachIcon />
          </GlassButton>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message Hermes"
            placeholderTextColor={INK.meta}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          {draft.trim() ? (
            <GlassButton size={box(37)} tint={C.paper} label="Send" onPress={send}>
              <ArrowUpIcon />
            </GlassButton>
          ) : (
            <GlassButton
              size={box(37)}
              tint={C.paper}
              label="Dictate"
              onPress={startRecording}
            >
              <MicIcon />
            </GlassButton>
          )}
        </GlassSurface>
        {aside ? (
          <Text style={styles.aside} numberOfLines={2}>
            {aside}
          </Text>
        ) : null}
      </View>

      <Sheet visible={attaching} onClose={() => setAttaching(false)}>
        <SheetHeader
          title="Attach"
          sub="Nothing is read from the phone: these are the files of the demo."
          onClose={() => setAttaching(false)}
        />
        <View style={styles.attachBody}>
          {ATTACHMENTS.map((item, index) => (
            <View key={item.kind} style={index > 0 ? styles.attachLine : undefined}>
              <Row
                name={item.kind}
                meta={`${item.name} · ${item.size}`}
                chevron={false}
                onPress={() => {
                  setAttaching(false);
                  onSend({ text: item.name, kind: 'attachment', attachment: item });
                }}
                right={
                  item.kind === 'Photo' ? (
                    <PhotoIcon />
                  ) : item.kind === 'File' ? (
                    <FileIcon />
                  ) : (
                    <CameraIcon />
                  )
                }
              />
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = createStyles({
  dock: { paddingTop: 6, paddingHorizontal: 9, paddingBottom: 10 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 50,
    padding: 5,
    borderRadius: 25,
  },
  input: { flex: 1, paddingHorizontal: 3, color: C.text, fontSize: 13 },
  // Said under the field, where it stays after the microphone is closed.
  aside: { marginTop: 5, paddingHorizontal: 6, color: '#a06a6a', fontSize: 10, lineHeight: 14 },

  roster: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 7,
    zIndex: 40,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 13,
    backgroundColor: '#26262a',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  optionActive: { backgroundColor: '#34343a' },
  optionName: { color: '#d4d4da', fontSize: 12 },
  optionRole: {
    marginLeft: 'auto',
    color: '#84848b',
    fontSize: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  attachBody: { marginTop: 12, paddingHorizontal: 12 },
  attachLine: { borderTopWidth: 1, borderTopColor: C.hairline },

  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 54,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,95,87,0.16)',
    borderRadius: 27,
    backgroundColor: '#2a2426',
  },
  round: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  cancel: { backgroundColor: '#3a3234' },
  stop: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#e5484d',
  },
  stopGlyph: { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    height: 26,
    overflow: 'hidden',
  },
  bar: { width: 2.5, borderRadius: 2, backgroundColor: '#f0b9b4' },
  time: { color: '#e8d9db', fontSize: 9, fontVariant: ['tabular-nums'] },
  note: { marginTop: 7, color: INK.label, fontSize: 9, textAlign: 'center' },
});
