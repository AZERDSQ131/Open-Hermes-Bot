// How a model is named, on both sides of the door.
//
// Hermes' own config may name its model the way its router does: a virtual
// provider `auto`, and a model id that carries the real provider inside it —
// `opencode-go/muse-spark`. The app, the picker and the model lock an API turn
// confirms all speak in a pair: one provider, one model id.
//
// Send `provider: auto` with `opencode-go/muse-spark` and the turn runs
// perfectly — the host resolves the prefix — and then fails at the very end:
// the lock compares what was asked (`opencode-go/muse-spark`) with what ran
// (`muse-spark`) and calls it a mismatch. That is the sentence a person saw
// after watching their bot work. The pair is the thing to get right.

'use strict';

/**
 * A provider and a model that mean the same thing to the host and to the
 * lock: `auto` is not a provider but a way of writing one, so the prefix
 * moves into the provider field, where everything else expects it.
 *
 * A pair the person picked is left exactly as it is: only `auto` is read.
 */
function modelRef(provider, model) {
  const given = String(provider ?? '').trim();
  const id = String(model ?? '').trim();
  if (!id) return { provider: given, model: id };
  if (given && given !== 'auto') return { provider: given, model: id };
  // Hermes also accepts `provider::model` for the same thing.
  const double = id.indexOf('::');
  if (double > 0 && double < id.length - 2) {
    return {
      provider: id.slice(0, double).trim(),
      model: id.slice(double + 2).trim(),
    };
  }
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) return { provider: given, model: id };
  return {
    provider: id.slice(0, slash).trim(),
    model: id.slice(slash + 1).trim(),
  };
}

module.exports = { modelRef };
