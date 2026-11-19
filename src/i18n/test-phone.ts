/*
 * Test setup: jsdom's phone speaks English, the tests read the Ukrainian
 * texts. Runs before any test file imports i18n/lang.ts, which picks the
 * language once, at load. English tests switch with `useLang('en')`.
 */
Object.defineProperty(navigator, 'languages', { value: ['uk-UA'], configurable: true });
Object.defineProperty(navigator, 'language', { value: 'uk-UA', configurable: true });
