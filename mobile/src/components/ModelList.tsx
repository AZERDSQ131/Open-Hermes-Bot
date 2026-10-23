import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MODELS } from '../data';
import { C, INK, createStyles } from '../theme';
import { CheckIcon, SearchIcon } from './Icons';

/**
 * The models a turn can run on, grouped by who serves them. The memory is
 * not here: a model is a choice for the conversation, nothing more.
 */
export function ModelList({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (name: string) => void;
}) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MODELS.map((group) => ({
      ...group,
      models: group.models.filter((model) =>
        `${model.name} ${model.meta ?? ''}`.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.models.length > 0);
  }, [query]);

  return (
    <View style={styles.root}>
      <View style={styles.search}>
        <SearchIcon color={INK.meta} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search models"
          placeholderTextColor="#82828a"
          style={styles.input}
          autoCorrect={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {groups.map((group) => (
          <View key={group.group}>
            <Text style={styles.groupName}>{group.group}</Text>
            {group.models.map((model) => {
              // The default is named by what it runs: one row marked, never two.
              const active =
                model.name === selected ||
                (model.name === 'Hermes default' && model.meta === selected);
              return (
                <Pressable
                  key={model.name}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => onPick(model.name === 'Hermes default' ? (model.meta ?? model.name) : model.name)}
                >
                  <Text style={[styles.mark, active && styles.markActive]}>{model.mark}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {model.name}
                  </Text>
                  {model.tag && active ? <Text style={styles.tag}>{model.tag}</Text> : null}
                  {model.meta && !active ? <Text style={styles.meta}>{model.meta}</Text> : null}
                  {active ? <CheckIcon /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {groups.length === 0 ? <Text style={styles.empty}>No model by that name.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = createStyles({
  root: { flex: 1, minHeight: 0 },
  search: {
    height: 33,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
    marginHorizontal: 16,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#1b1b1d',
  },
  input: { flex: 1, color: C.text, fontSize: 12, padding: 0 },
  body: { paddingTop: 6, paddingHorizontal: 10, paddingBottom: 18 },
  groupName: {
    paddingTop: 9,
    paddingHorizontal: 8,
    paddingBottom: 4,
    color: INK.label,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.04,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  rowActive: { backgroundColor: C.bean },
  mark: {
    width: 25,
    height: 25,
    borderRadius: 7,
    backgroundColor: '#323237',
    color: '#b9b9c0',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 25,
  },
  markActive: { backgroundColor: '#3d3d44', color: C.text },
  name: { color: '#e8e8ec', fontSize: 13, fontWeight: '500', letterSpacing: -0.1 },
  tag: {
    marginLeft: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#9d9da4',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  meta: { marginLeft: 'auto', color: '#85858c', fontSize: 9 },
  empty: { color: INK.quiet, fontSize: 12, padding: 12 },
});
