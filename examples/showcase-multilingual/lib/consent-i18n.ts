import type { ConsentProviderOptions } from '@inth/nextjs';
// Inth bundles only English. These two imports add its built-in German and
// French copy, so the banner and dialog can switch to them. The browser
// doesn't download the other languages.
import '@inth/nextjs/translations/de';
import '@inth/nextjs/translations/fr';

type ConsentMessages = NonNullable<
	NonNullable<ConsentProviderOptions['i18n']>['messages']
>;

// One line per language in Northwind's own voice. Every key left out keeps
// Inth's wording, or your project's wording once a backend supplies the copy.
export const messages = {
	de: { cookieBanner: { title: 'Kurz zu Cookies' } },
	en: { cookieBanner: { title: 'A quick word about cookies' } },
	fr: { cookieBanner: { title: 'Un mot sur les cookies' } },
} satisfies ConsentMessages;
