// Uses the `jest-expo/node` preset (Node-only variant, no jsdom/RN component rendering
// setup, matching what the current tests need). Prior to the Expo SDK 57 migration this
// project avoided the `jest-expo` preset entirely because its generated
// transformIgnorePatterns didn't account for pnpm's nested `.pnpm` store layout, leaving
// react-native's Flow syntax unstripped. jest-expo@57's own jest-preset.js now explicitly
// whitelists `.pnpm` in transformIgnorePatterns — verified fixed by re-enabling the preset
// and confirming all existing tests (and the newly-required transform of expo's
// `process.env.EXPO_PUBLIC_*` virtual module) pass.
module.exports = {
  preset: 'jest-expo/node',
  testPathIgnorePatterns: ['/node_modules/']
};
