/**
 * French and English.
 *
 * Not a nicety in Montreal. Note what is *not* translated: the sign text itself
 * is always the verbatim French from the city's feed, because the sign on the
 * street is the authority and a paraphrase of it would be a different claim.
 * Only the app's own words appear here.
 */

export type Language = 'en' | 'fr';

const STRINGS = {
  en: {
    'legend.title': 'Legend',
    'status.free': 'Free',
    'status.paid': 'Paid',
    'status.limited': 'Time limited',
    'status.permit_only': 'Permit only',
    'status.no_parking': 'No parking',
    'status.no_standing': 'No stopping',
    'status.unknown': 'Check the sign',

    'verdict.free': 'You can park here',
    'verdict.paid': 'Paid parking',
    'verdict.limited': 'Limited parking',
    'verdict.permit_only': 'Permit holders only',
    'verdict.no_parking': 'No parking',
    'verdict.no_standing': 'No stopping',
    'verdict.unknown': 'Check the sign',

    'sub.none': 'No restrictions posted',
    'sub.always': 'At all times',
    'sub.untilMove': 'Until {when}, then you must move',
    'sub.untilFree': 'Until {when} — free after that',
    'sub.until': 'Until {when}',
    'sub.untilThen': 'Until {when}, then {status}',
    'sub.tomorrow': '{time} tomorrow',

    'sheet.onePanel': 'The sign on this pole',
    'sheet.panels': '{n} panels on this pole, top to bottom',
    'sheet.inForce': 'In force now',
    'sheet.notUnderstood': 'not fully understood',
    'sheet.verify':
      'Part of this sign could not be read automatically. Check the sign itself before you leave the car.',
    'sheet.perHour': '{amount} / hour',
    'sheet.maxTariff': 'max {amount}',
    'sheet.noTariff': 'Tariff not listed',
    'sheet.accessible': 'Accessible space',
    'sheet.shares': 'Shares a meter with {id}',
    'sheet.maxDuration': 'max {duration}',

    'scrubber.now': 'Now',
    'search.placeholder': 'Street or borough',
    'search.noResults': 'No match',
    'search.streets': 'Streets with paid parking',
    'search.boroughs': 'Boroughs',
    'search.limitation':
      'Only streets with paid parking can be searched by name; everywhere else, search by borough.',

    'settings.title': 'About & settings',
    'settings.language': 'Language',
    'settings.system': 'System',
    'settings.data': 'Data',
    'settings.dataVintage': 'Published {date}',
    'settings.checkUpdates': 'Check for updates',
    'settings.checking': 'Checking…',
    'settings.upToDate': 'Up to date',
    'settings.updated': 'Updated — restart to apply',
    'settings.updateFailed': 'Could not check for updates',
    'settings.sources': 'Sources',
    'settings.close': 'Close',

    'disclaimer.short': 'Guidance only — the signs on the street are authoritative.',
    'disclaimer.long':
      'Both publishers state the data may diverge from conditions in the field. This app is guidance, not a guarantee. The signs on the street are authoritative.',
  },

  fr: {
    'legend.title': 'Légende',
    'status.free': 'Libre',
    'status.paid': 'Payant',
    'status.limited': 'Durée limitée',
    'status.permit_only': 'Permis seulement',
    'status.no_parking': 'Stationnement interdit',
    'status.no_standing': 'Arrêt interdit',
    'status.unknown': 'Vérifiez le panneau',

    'verdict.free': 'Vous pouvez stationner ici',
    'verdict.paid': 'Stationnement payant',
    'verdict.limited': 'Stationnement à durée limitée',
    'verdict.permit_only': 'Détenteurs de permis seulement',
    'verdict.no_parking': 'Stationnement interdit',
    'verdict.no_standing': 'Arrêt interdit',
    'verdict.unknown': 'Vérifiez le panneau',

    'sub.none': 'Aucune restriction affichée',
    'sub.always': 'En tout temps',
    'sub.untilMove': "Jusqu'à {when}, ensuite vous devez partir",
    'sub.untilFree': "Jusqu'à {when} — libre par la suite",
    'sub.until': "Jusqu'à {when}",
    'sub.untilThen': "Jusqu'à {when}, ensuite {status}",
    'sub.tomorrow': '{time} demain',

    'sheet.onePanel': 'Le panneau sur ce poteau',
    'sheet.panels': '{n} panneaux sur ce poteau, de haut en bas',
    'sheet.inForce': 'En vigueur maintenant',
    'sheet.notUnderstood': 'non entièrement interprété',
    'sheet.verify':
      "Une partie de ce panneau n'a pas pu être lue automatiquement. Vérifiez le panneau avant de quitter votre véhicule.",
    'sheet.perHour': '{amount} / heure',
    'sheet.maxTariff': 'max {amount}',
    'sheet.noTariff': 'Tarif non indiqué',
    'sheet.accessible': 'Place accessible',
    'sheet.shares': 'Partage un parcomètre avec {id}',
    'sheet.maxDuration': 'max {duration}',

    'scrubber.now': 'Maintenant',
    'search.placeholder': 'Rue ou arrondissement',
    'search.noResults': 'Aucun résultat',
    'search.streets': 'Rues avec stationnement payant',
    'search.boroughs': 'Arrondissements',
    'search.limitation':
      'Seules les rues avec stationnement payant peuvent être cherchées par nom; ailleurs, cherchez par arrondissement.',

    'settings.title': 'À propos et réglages',
    'settings.language': 'Langue',
    'settings.system': 'Système',
    'settings.data': 'Données',
    'settings.dataVintage': 'Publiées le {date}',
    'settings.checkUpdates': 'Vérifier les mises à jour',
    'settings.checking': 'Vérification…',
    'settings.upToDate': 'À jour',
    'settings.updated': 'Mises à jour — redémarrez pour appliquer',
    'settings.updateFailed': 'Vérification impossible',
    'settings.sources': 'Sources',
    'settings.close': 'Fermer',

    'disclaimer.short':
      'Indicatif seulement — les panneaux sur la rue font foi.',
    'disclaimer.long':
      "Les deux fournisseurs précisent que les données peuvent différer de la réalité sur le terrain. Cette application est indicative et ne constitue pas une garantie. Les panneaux sur la rue font foi.",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];

/**
 * The first language we speak from the device's ordered preferences.
 *
 * Takes the codes rather than reading them, so this module stays free of native
 * imports and can be tested — and so the caller decides where they come from.
 */
export function pickLanguage(languageCodes: Array<string | null | undefined>): Language {
  for (const code of languageCodes) {
    const tag = code?.toLowerCase().split('-')[0];
    if (tag === 'fr') return 'fr';
    if (tag === 'en') return 'en';
  }
  // Montreal's own default. Someone whose phone is in neither language is more
  // likely to be helped by the language the signs are written in.
  return 'fr';
}

/**
 * Look up a string, substituting `{named}` placeholders.
 *
 * Falls back to English rather than showing a raw key: a missing translation
 * should degrade to a readable sentence, not to debug output.
 */
export function translate(
  lang: Language,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  const template: string = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export type Translator = (key: StringKey, vars?: Record<string, string | number>) => string;

export function translatorFor(lang: Language): Translator {
  return (key, vars) => translate(lang, key, vars);
}
