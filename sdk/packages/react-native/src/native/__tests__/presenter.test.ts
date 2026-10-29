import { describe, expect, test, vi } from 'vitest';
const native = vi.hoisted(() => ({ presentPreferences: vi.fn(), presentConsentPrompt: vi.fn(), closeConsentPresenter: vi.fn() }));
const events = vi.hoisted(() => ({ addListener: vi.fn() }));
vi.mock('../module', () => ({ getNativeC15t: () => native, getNativeC15tEvents: () => events }));
import { closeConsentPresenter, onConsentPresenterOutcome, parseConsentPresenterOutcome, presentConsentPrompt, presentPreferences } from '../presenter';
describe('shared native presenter boundary', () => {
 test('forwards commands and preserves session identity', async () => {
  native.presentPreferences.mockResolvedValue(JSON.stringify({ sessionId: 'one', status: 'already-presented' }));
  expect(await presentPreferences('https://app.test/privacy')).toEqual({ sessionId: 'one', status: 'already-presented' });
  expect(native.presentPreferences).toHaveBeenCalledWith('https://app.test/privacy');
  native.presentConsentPrompt.mockResolvedValue('{"sessionId":null,"status":"not-required"}');
  expect(await presentConsentPrompt('https://app.test/privacy')).toEqual({ sessionId: null, status: 'not-required' });
  await closeConsentPresenter('obsolete');
  expect(native.closeConsentPresenter).toHaveBeenCalledWith('obsolete');
 });
 test('receives compact final outcomes and removes the native listener', () => {
  const remove = vi.fn(); const receive = vi.fn();
  events.addListener.mockReturnValue({ remove });
  const stop = onConsentPresenterOutcome(receive);
  const callback = events.addListener.mock.calls[0]?.[1];
  callback('{"sessionId":"one","kind":"committed","revision":9}');
  expect(receive).toHaveBeenCalledExactlyOnceWith({ sessionId: 'one', kind: 'committed', revision: 9 });
  stop(); expect(remove).toHaveBeenCalledOnce();
 });
 test.each(['{}', '{"sessionId":"x","kind":"toggle","revision":1}', '{"sessionId":"x","kind":"committed","revision":-1}'])('refuses invalid native outcome %s', (payload) => {
  expect(() => parseConsentPresenterOutcome(payload)).toThrow();
 });
});
