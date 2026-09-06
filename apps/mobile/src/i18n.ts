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
    'answer.none': 'No parking data here',
    'answer.noneHint': 'Move the map over a street with signs',
    'scrubber.at': 'At {time}',

    'onboard.colours.title': 'What the colours mean',
    'onboard.colours.body':
      'Bright, larger dots are parking you can use right now. They are drawn to stand out so you can find them at a glance.',
    'onboard.colours.restricted': 'Dimmer and smaller — you cannot park',
    'onboard.trust.title': 'The sign always wins',
    'onboard.trust.body':
      'This app reads the city\u2019s own signage data, but that data can differ from what is actually on the street. Check the sign before you leave your car.',
    'onboard.trust.sources':
      'Données : Agence de mobilité durable de Montréal; Ville de Montréal (CC BY 4.0)',
    'onboard.location.title': 'Find parking near you',
    'onboard.location.body':
      'Your location is used on the device to centre the map. It is never stored and never leaves your phone.',
    'onboard.next': 'Next',
    'onboard.allow': 'Use my location',
    'onboard.notNow': 'Not now',

    'legend.available': 'You can park',
    'legend.restricted': 'You cannot',
    'search.placeholder': 'Street or borough',
    'search.noResults': 'No match',
    'search.streets': 'Streets with paid parking',
    'search.boroughs': 'Boroughs',
    'search.limitation':
      'Only streets with paid parking can be searched by name; everywhere else, search by borough.',

    'support.open': 'Support parkmtl',
    'support.openHint': 'Free forever — contributions are optional',
    'support.title': 'Support parkmtl',
    'support.freeTitle': 'Free for everyone, always',
    'support.freeBody':
      'Every feature is free, with no ads and no tracking. Your location never leaves your phone. Contributions are entirely optional and never unlock anything. 🙏',
    'support.oneTimeTitle': 'Buy me a coffee',
    'support.oneTimeCaption': 'A one-time contribution',
    'support.tipSmall': 'Small contribution',
    'support.tipLarge': 'Large contribution',
    'support.monthlyTitle': 'Become a monthly supporter',
    'support.monthlyCaption': 'Auto-renews · cancel anytime',
    'support.monthly': 'Monthly supporter',
    'support.perMonth': '{price}/mo',
    'support.restore': 'Restore purchases',
    'support.restoreHint': 'Already supported? Restore here',
    'support.restoreDone': 'Restore complete',
    'support.restoreDoneBody': 'Any previous purchases have been restored.',
    'support.restoreFailed': 'Restore failed',
    'support.thanks': 'Thank you! 🙏',
    'support.thanksBody':
      'Your support means a lot and helps keep the app free for everyone.',
    'support.failed': 'Purchase failed',
    'support.failedBody': 'Please try again later.',
    'support.unavailable': 'The store is not available right now.',
    'support.dataNote':
      'Parking data comes from the City of Montréal and the Agence de mobilité durable, free of charge under CC BY 4.0. Contributions support development only.',
    'settings.title': 'About & settings',
    'settings.language': 'Language',
    'settings.system': 'System',
    'settings.data': 'Data',
    'settings.dataVintage': 'Published {date}',
    'settings.checkUpdates': 'Check for updates',
    'settings.checking': 'Checking…',
    'settings.upToDate': 'Up to date',
    'settings.updated': 'Updated',
    'settings.noSource': 'No update source configured',
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
    'answer.none': 'Aucune donnée ici',
    'answer.noneHint': 'Déplacez la carte sur une rue avec des panneaux',
    'scrubber.at': 'À {time}',

    'onboard.colours.title': 'Ce que les couleurs signifient',
    'onboard.colours.body':
      'Les points vifs et plus gros indiquent un stationnement utilisable maintenant. Ils ressortent pour être repérés d\u2019un coup d\u2019œil.',
    'onboard.colours.restricted': 'Plus pâles et plus petits — stationnement interdit',
    'onboard.trust.title': 'Le panneau fait foi',
    'onboard.trust.body':
      'Cette application lit les données de signalisation de la Ville, mais elles peuvent différer de la réalité sur la rue. Vérifiez le panneau avant de quitter votre véhicule.',
    'onboard.trust.sources':
      'Données : Agence de mobilité durable de Montréal; Ville de Montréal (CC BY 4.0)',
    'onboard.location.title': 'Trouver du stationnement près de vous',
    'onboard.location.body':
      'Votre position sert uniquement à centrer la carte, sur l\u2019appareil. Elle n\u2019est jamais enregistrée ni transmise.',
    'onboard.next': 'Suivant',
    'onboard.allow': 'Utiliser ma position',
    'onboard.notNow': 'Plus tard',

    'legend.available': 'Vous pouvez stationner',
    'legend.restricted': 'Interdit',
    'search.placeholder': 'Rue ou arrondissement',
    'search.noResults': 'Aucun résultat',
    'search.streets': 'Rues avec stationnement payant',
    'search.boroughs': 'Arrondissements',
    'search.limitation':
      'Seules les rues avec stationnement payant peuvent être cherchées par nom; ailleurs, cherchez par arrondissement.',

    'support.open': 'Soutenir parkmtl',
    'support.openHint': 'Gratuit pour toujours — les contributions sont optionnelles',
    'support.title': 'Soutenir parkmtl',
    'support.freeTitle': 'Gratuit pour tous, toujours',
    'support.freeBody':
      "Toutes les fonctions sont gratuites, sans publicité ni pistage. Votre position ne quitte jamais votre appareil. Les contributions sont entièrement optionnelles et ne débloquent rien. 🙏",
    'support.oneTimeTitle': 'Offrez-moi un café',
    'support.oneTimeCaption': 'Une contribution unique',
    'support.tipSmall': 'Petite contribution',
    'support.tipLarge': 'Grande contribution',
    'support.monthlyTitle': 'Devenir soutien mensuel',
    'support.monthlyCaption': 'Renouvellement automatique · annulable en tout temps',
    'support.monthly': 'Soutien mensuel',
    'support.perMonth': '{price}/mois',
    'support.restore': 'Restaurer les achats',
    'support.restoreHint': 'Déjà contribué? Restaurez ici',
    'support.restoreDone': 'Restauration terminée',
    'support.restoreDoneBody': 'Vos achats précédents ont été restaurés.',
    'support.restoreFailed': 'Échec de la restauration',
    'support.thanks': 'Merci! 🙏',
    'support.thanksBody':
      "Votre soutien compte beaucoup et aide à garder l'application gratuite pour tous.",
    'support.failed': "Échec de l'achat",
    'support.failedBody': 'Veuillez réessayer plus tard.',
    'support.unavailable': "La boutique n'est pas disponible pour le moment.",
    'support.dataNote':
      "Les données de stationnement proviennent de la Ville de Montréal et de l'Agence de mobilité durable, gratuitement sous licence CC BY 4.0. Les contributions financent uniquement le développement.",
    'settings.title': 'À propos et réglages',
    'settings.language': 'Langue',
    'settings.system': 'Système',
    'settings.data': 'Données',
    'settings.dataVintage': 'Publiées le {date}',
    'settings.checkUpdates': 'Vérifier les mises à jour',
    'settings.checking': 'Vérification…',
    'settings.upToDate': 'À jour',
    'settings.updated': 'Mises à jour',
    'settings.noSource': 'Aucune source de mise à jour configurée',
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
