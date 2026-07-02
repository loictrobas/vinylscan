"use client";

import { useEffect, useState, useCallback } from "react";

export type StoreLang = "en" | "es" | "fr" | "de" | "pt";

export const STORE_LANGS: { code: StoreLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "fr", label: "FR" },
  { code: "de", label: "DE" },
  { code: "pt", label: "PT" },
];

export interface StoreTranslations {
  notFound: { title: string; body: string };
  nav: { shop: string; accessories: string; sellTrade: string; about: string; bag: string };
  card: {
    new: string;
    inCart: string;
    add: string;
    untitled: string;
    unknownArtist: string;
    outOfStock: string;
    inStockCount: (n: number) => string;
  };
  carousel: { newArrivals: string; onDiscogs: string; viewAll: string };
  hero: {
    independentShop: (location?: string | null) => string;
    defaultName: string;
    browseShop: string;
    featuredRelease: string;
    unknown: string;
    newTag: string;
    website: string;
  };
  home: {
    digByGenre: string;
    titleCount: (padded: string, n: number) => string;
    accessories: string;
    shopGear: string;
    sellTradeLabel: string;
    sellTradeHeadline1: string;
    sellTradeHeadline2: string;
    sellTradeBody: string;
    getOffer: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    theShop: string;
    aboutTitle: (name: string) => string;
    readOurStory: string;
  };
  shop: {
    eyebrow: string;
    allRecords: string;
    searchPlaceholder: string;
    sortNewest: string;
    sortPriceAsc: string;
    sortPriceDesc: string;
    sortAZ: string;
    recordCount: (n: number, total: number, filtered: boolean) => string;
    noMatch: string;
    noneAvailable: string;
    clearFilters: string;
  };
  sidebar: { genreStyle: string; format: string; condition: string; maxPrice: string; any: string; all: string; clearAll: string };
  product: {
    backToShop: string;
    year: string;
    format: string;
    condition: string;
    catalogNumber: string;
    addToBag: string;
    pickupOnly: string;
    tracklist: string;
    tracklistUnavailable: string;
    relatedTitle: string;
  };
  acc: { eyebrow: string; title: string; allCount: (n: number) => string; none: string };
  sell: {
    eyebrow: string;
    headline1: string;
    headline2: string;
    body: string;
    yourName: string;
    email: string;
    approxRecords: string;
    approxPlaceholder: string;
    preferredPayout: string;
    payoutCash: string;
    payoutCredit: string;
    payoutEither: string;
    highlights: string;
    highlightsPlaceholder: string;
    requestOffer: string;
    doneTitle: string;
    doneBody: string;
    submitAnother: string;
  };
  about: { eyebrow: string; defaultTitle: string; titlesInStock: string; whatsapp: string };
  checkout: {
    eyebrow: string;
    title: string;
    subtitle: string;
    name: string;
    emailOrPhone: string;
    emailOrPhonePlaceholder: string;
    note: string;
    notePlaceholder: string;
    orderSummary: string;
    total: string;
    pickupNote: string;
    placeOrder: string;
    backToCart: string;
    thanks: (name?: string) => string;
    orderLine: (ref: string, total: string) => string;
    confirmBody: string;
    keepDigging: string;
    emptyBag: string;
    startDigging: string;
  };
  footer: { contact: string; hours: string; follow: string; website: string; copyright: (year: number, name: string) => string; poweredBy: string };
  cart: { bagCount: (n: number) => string; empty: string; startDigging: string; remove: string; total: string; pickupOnly: string; checkout: string };
}

const en: StoreTranslations = {
  notFound: { title: "Store not found", body: "This store doesn't exist or isn't public yet." },
  nav: { shop: "Shop", accessories: "Accessories", sellTrade: "Sell/Trade", about: "About", bag: "Bag" },
  card: {
    new: "New",
    inCart: "In cart",
    add: "Add",
    untitled: "Untitled",
    unknownArtist: "Unknown artist",
    outOfStock: "Out of stock",
    inStockCount: (n) => `${n} in stock`,
  },
  carousel: { newArrivals: "New Arrivals", onDiscogs: "On Discogs", viewAll: "View all" },
  hero: {
    independentShop: (loc) => (loc ? `Independent record shop · ${loc}` : "Independent record shop"),
    defaultName: "Record Store",
    browseShop: "Browse the shop",
    featuredRelease: "Featured release",
    unknown: "Unknown",
    newTag: "NEW",
    website: "Website",
  },
  home: {
    digByGenre: "Dig by genre",
    titleCount: (padded, n) => `${padded} title${n !== 1 ? "s" : ""}`,
    accessories: "Accessories",
    shopGear: "Shop gear →",
    sellTradeLabel: "Sell / Trade",
    sellTradeHeadline1: "Turn your shelves",
    sellTradeHeadline2: "into store credit.",
    sellTradeBody: "We buy and trade collections of any size. Fair offers, no lowballs.",
    getOffer: "Get an offer",
    step1Title: "Tell us what you've got",
    step1Desc: "Snap a photo or list the highlights.",
    step2Title: "We make an offer",
    step2Desc: "Usually within two business days.",
    step3Title: "Cash or credit",
    step3Desc: "Cash, or credit with more on top.",
    theShop: "The shop",
    aboutTitle: (name) => `About ${name}`,
    readOurStory: "Read our story",
  },
  shop: {
    eyebrow: "Shop",
    allRecords: "All records",
    searchPlaceholder: "Search artist, title, label…",
    sortNewest: "Newest",
    sortPriceAsc: "Price ↑",
    sortPriceDesc: "Price ↓",
    sortAZ: "A–Z",
    recordCount: (n, total, filtered) => `${n} record${n !== 1 ? "s" : ""}${filtered ? ` of ${total}` : ""}`,
    noMatch: "No records match your filters.",
    noneAvailable: "No records available right now.",
    clearFilters: "Clear filters",
  },
  sidebar: { genreStyle: "Genre / Style", format: "Format", condition: "Condition", maxPrice: "Max price", any: "Any", all: "All", clearAll: "Clear all filters" },
  product: {
    backToShop: "Back to shop",
    year: "Year",
    format: "Format",
    condition: "Condition",
    catalogNumber: "Catalogue #",
    addToBag: "Add to bag",
    pickupOnly: "Store pickup only — no shipping.",
    tracklist: "Tracklist",
    tracklistUnavailable: "Tracklist not available",
    relatedTitle: "You might also like",
  },
  acc: { eyebrow: "For the setup", title: "Accessories", allCount: (n) => `All (${n})`, none: "No accessories available right now." },
  sell: {
    eyebrow: "Sell / Trade",
    headline1: "Sell or trade",
    headline2: "your records.",
    body: "One crate or a whole collection — tell us what you have and we'll come back with a fair offer within two business days.",
    yourName: "Your name",
    email: "Email",
    approxRecords: "Approx. number of records",
    approxPlaceholder: "e.g. 50",
    preferredPayout: "Preferred payout",
    payoutCash: "Cash",
    payoutCredit: "Store credit",
    payoutEither: "Either",
    highlights: "Highlights & condition notes",
    highlightsPlaceholder: "Genres, standout titles, pressing or condition notes…",
    requestOffer: "Request an offer",
    doneTitle: "Thanks — we got it",
    doneBody: "We'll reach out about your records soon.",
    submitAnother: "Submit another",
  },
  about: { eyebrow: "The shop", defaultTitle: "About us", titlesInStock: "Titles in stock", whatsapp: "WhatsApp" },
  checkout: {
    eyebrow: "Checkout",
    title: "Pickup details",
    subtitle: "Pay in person when you collect — no shipping.",
    name: "Name",
    emailOrPhone: "Email or phone",
    emailOrPhonePlaceholder: "So the store can reach you",
    note: "Note (optional)",
    notePlaceholder: "Preferred pickup time, etc.",
    orderSummary: "Order summary",
    total: "Total",
    pickupNote: "Store pickup only — no shipping, pay in person.",
    placeOrder: "Place order",
    backToCart: "Back to cart",
    thanks: (name) => (name ? `Thanks, ${name}!` : "Thanks!"),
    orderLine: (ref, total) => `Order ${ref} — ${total}`,
    confirmBody: "We sent your order to the store — they'll confirm pickup with you.",
    keepDigging: "Keep digging →",
    emptyBag: "Your bag is empty.",
    startDigging: "Start digging →",
  },
  footer: { contact: "Contact", hours: "Hours", follow: "Follow", website: "Website", copyright: (y, name) => `© ${y} ${name}. All rights reserved.`, poweredBy: "Powered by" },
  cart: { bagCount: (n) => `Bag (${n})`, empty: "Your bag is empty", startDigging: "Start digging →", remove: "Remove", total: "Total", pickupOnly: "Store pickup only — no shipping.", checkout: "Checkout" },
};

const es: StoreTranslations = {
  notFound: { title: "Tienda no encontrada", body: "Esta tienda no existe o todavía no es pública." },
  nav: { shop: "Tienda", accessories: "Accesorios", sellTrade: "Vender/Canjear", about: "Nosotros", bag: "Carrito" },
  card: {
    new: "Nuevo",
    inCart: "En el carrito",
    add: "Agregar",
    untitled: "Sin título",
    unknownArtist: "Artista desconocido",
    outOfStock: "Sin stock",
    inStockCount: (n) => `${n} disponibles`,
  },
  carousel: { newArrivals: "Recién llegados", onDiscogs: "En Discogs", viewAll: "Ver todo" },
  hero: {
    independentShop: (loc) => (loc ? `Disquería independiente · ${loc}` : "Disquería independiente"),
    defaultName: "Disquería",
    browseShop: "Ver la tienda",
    featuredRelease: "Destacado",
    unknown: "Desconocido",
    newTag: "NUEVO",
    website: "Sitio web",
  },
  home: {
    digByGenre: "Buscar por género",
    titleCount: (padded, n) => `${padded} título${n !== 1 ? "s" : ""}`,
    accessories: "Accesorios",
    shopGear: "Ver accesorios →",
    sellTradeLabel: "Vender / Canjear",
    sellTradeHeadline1: "Convertí tus discos",
    sellTradeHeadline2: "en crédito de tienda.",
    sellTradeBody: "Compramos y canjeamos colecciones de cualquier tamaño. Ofertas justas, sin regatear de menos.",
    getOffer: "Pedir una oferta",
    step1Title: "Contanos qué tenés",
    step1Desc: "Mandá una foto o listá lo más destacado.",
    step2Title: "Te hacemos una oferta",
    step2Desc: "Normalmente en dos días hábiles.",
    step3Title: "Efectivo o crédito",
    step3Desc: "Efectivo, o crédito con un extra.",
    theShop: "La tienda",
    aboutTitle: (name) => `Sobre ${name}`,
    readOurStory: "Conocé nuestra historia",
  },
  shop: {
    eyebrow: "Tienda",
    allRecords: "Todos los discos",
    searchPlaceholder: "Buscar artista, título, sello…",
    sortNewest: "Más recientes",
    sortPriceAsc: "Precio ↑",
    sortPriceDesc: "Precio ↓",
    sortAZ: "A–Z",
    recordCount: (n, total, filtered) => `${n} disco${n !== 1 ? "s" : ""}${filtered ? ` de ${total}` : ""}`,
    noMatch: "Ningún disco coincide con tus filtros.",
    noneAvailable: "No hay discos disponibles por ahora.",
    clearFilters: "Limpiar filtros",
  },
  sidebar: { genreStyle: "Género / Estilo", format: "Formato", condition: "Condición", maxPrice: "Precio máximo", any: "Cualquiera", all: "Todos", clearAll: "Limpiar todos los filtros" },
  product: {
    backToShop: "Volver a la tienda",
    year: "Año",
    format: "Formato",
    condition: "Condición",
    catalogNumber: "N.º de catálogo",
    addToBag: "Agregar al carrito",
    pickupOnly: "Solo retiro en tienda — sin envío.",
    tracklist: "Lista de temas",
    tracklistUnavailable: "Lista de temas no disponible",
    relatedTitle: "También te puede gustar",
  },
  acc: { eyebrow: "Para tu equipo", title: "Accesorios", allCount: (n) => `Todos (${n})`, none: "No hay accesorios disponibles por ahora." },
  sell: {
    eyebrow: "Vender / Canjear",
    headline1: "Vendé o canjeá",
    headline2: "tus discos.",
    body: "Un cajón o toda una colección — contanos qué tenés y te volvemos con una oferta justa en dos días hábiles.",
    yourName: "Tu nombre",
    email: "Email",
    approxRecords: "Cantidad aproximada de discos",
    approxPlaceholder: "ej. 50",
    preferredPayout: "Forma de pago preferida",
    payoutCash: "Efectivo",
    payoutCredit: "Crédito de tienda",
    payoutEither: "Cualquiera",
    highlights: "Destacados y notas de condición",
    highlightsPlaceholder: "Géneros, títulos destacados, prensados o notas de condición…",
    requestOffer: "Pedir una oferta",
    doneTitle: "Gracias — ya lo recibimos",
    doneBody: "Te vamos a contactar pronto sobre tus discos.",
    submitAnother: "Enviar otro",
  },
  about: { eyebrow: "La tienda", defaultTitle: "Sobre nosotros", titlesInStock: "Títulos en stock", whatsapp: "WhatsApp" },
  checkout: {
    eyebrow: "Finalizar compra",
    title: "Datos de retiro",
    subtitle: "Pagás en persona cuando retirás — sin envío.",
    name: "Nombre",
    emailOrPhone: "Email o teléfono",
    emailOrPhonePlaceholder: "Para que la tienda te pueda contactar",
    note: "Nota (opcional)",
    notePlaceholder: "Horario preferido de retiro, etc.",
    orderSummary: "Resumen del pedido",
    total: "Total",
    pickupNote: "Solo retiro en tienda — sin envío, pago en persona.",
    placeOrder: "Confirmar pedido",
    backToCart: "Volver al carrito",
    thanks: (name) => (name ? `¡Gracias, ${name}!` : "¡Gracias!"),
    orderLine: (ref, total) => `Pedido ${ref} — ${total}`,
    confirmBody: "Enviamos tu pedido a la tienda — te van a confirmar el retiro.",
    keepDigging: "Seguir buscando →",
    emptyBag: "Tu carrito está vacío.",
    startDigging: "Empezar a buscar →",
  },
  footer: { contact: "Contacto", hours: "Horarios", follow: "Seguinos", website: "Sitio web", copyright: (y, name) => `© ${y} ${name}. Todos los derechos reservados.`, poweredBy: "Desarrollado con" },
  cart: { bagCount: (n) => `Carrito (${n})`, empty: "Tu carrito está vacío", startDigging: "Empezar a buscar →", remove: "Quitar", total: "Total", pickupOnly: "Solo retiro en tienda — sin envío.", checkout: "Finalizar compra" },
};

const fr: StoreTranslations = {
  notFound: { title: "Boutique introuvable", body: "Cette boutique n'existe pas ou n'est pas encore publique." },
  nav: { shop: "Boutique", accessories: "Accessoires", sellTrade: "Vendre/Échanger", about: "À propos", bag: "Panier" },
  card: {
    new: "Nouveau",
    inCart: "Dans le panier",
    add: "Ajouter",
    untitled: "Sans titre",
    unknownArtist: "Artiste inconnu",
    outOfStock: "Rupture de stock",
    inStockCount: (n) => `${n} en stock`,
  },
  carousel: { newArrivals: "Nouveautés", onDiscogs: "Sur Discogs", viewAll: "Voir tout" },
  hero: {
    independentShop: (loc) => (loc ? `Disquaire indépendant · ${loc}` : "Disquaire indépendant"),
    defaultName: "Disquaire",
    browseShop: "Voir la boutique",
    featuredRelease: "Mis en avant",
    unknown: "Inconnu",
    newTag: "NOUVEAU",
    website: "Site web",
  },
  home: {
    digByGenre: "Explorer par genre",
    titleCount: (padded, n) => `${padded} titre${n !== 1 ? "s" : ""}`,
    accessories: "Accessoires",
    shopGear: "Voir les accessoires →",
    sellTradeLabel: "Vendre / Échanger",
    sellTradeHeadline1: "Transformez vos disques",
    sellTradeHeadline2: "en crédit boutique.",
    sellTradeBody: "Nous achetons et échangeons des collections de toute taille. Offres justes, sans sous-évaluation.",
    getOffer: "Demander une offre",
    step1Title: "Dites-nous ce que vous avez",
    step1Desc: "Une photo ou la liste des points forts.",
    step2Title: "Nous faisons une offre",
    step2Desc: "Généralement sous deux jours ouvrés.",
    step3Title: "Argent ou crédit",
    step3Desc: "En espèces, ou en crédit majoré.",
    theShop: "La boutique",
    aboutTitle: (name) => `À propos de ${name}`,
    readOurStory: "Découvrir notre histoire",
  },
  shop: {
    eyebrow: "Boutique",
    allRecords: "Tous les disques",
    searchPlaceholder: "Rechercher artiste, titre, label…",
    sortNewest: "Plus récents",
    sortPriceAsc: "Prix ↑",
    sortPriceDesc: "Prix ↓",
    sortAZ: "A–Z",
    recordCount: (n, total, filtered) => `${n} disque${n !== 1 ? "s" : ""}${filtered ? ` sur ${total}` : ""}`,
    noMatch: "Aucun disque ne correspond à vos filtres.",
    noneAvailable: "Aucun disque disponible pour le moment.",
    clearFilters: "Effacer les filtres",
  },
  sidebar: { genreStyle: "Genre / Style", format: "Format", condition: "État", maxPrice: "Prix max", any: "Tous", all: "Tous", clearAll: "Effacer tous les filtres" },
  product: {
    backToShop: "Retour à la boutique",
    year: "Année",
    format: "Format",
    condition: "État",
    catalogNumber: "N° de catalogue",
    addToBag: "Ajouter au panier",
    pickupOnly: "Retrait en boutique uniquement — pas de livraison.",
    tracklist: "Liste des titres",
    tracklistUnavailable: "Liste des titres indisponible",
    relatedTitle: "Vous pourriez aussi aimer",
  },
  acc: { eyebrow: "Pour votre installation", title: "Accessoires", allCount: (n) => `Tous (${n})`, none: "Aucun accessoire disponible pour le moment." },
  sell: {
    eyebrow: "Vendre / Échanger",
    headline1: "Vendez ou échangez",
    headline2: "vos disques.",
    body: "Un carton ou toute une collection — dites-nous ce que vous avez et nous reviendrons avec une offre juste en deux jours ouvrés.",
    yourName: "Votre nom",
    email: "Email",
    approxRecords: "Nombre approximatif de disques",
    approxPlaceholder: "ex. 50",
    preferredPayout: "Paiement préféré",
    payoutCash: "Espèces",
    payoutCredit: "Crédit boutique",
    payoutEither: "Les deux",
    highlights: "Points forts et état",
    highlightsPlaceholder: "Genres, titres marquants, pressage ou état…",
    requestOffer: "Demander une offre",
    doneTitle: "Merci — c'est reçu",
    doneBody: "Nous vous recontacterons bientôt au sujet de vos disques.",
    submitAnother: "Envoyer une autre demande",
  },
  about: { eyebrow: "La boutique", defaultTitle: "À propos de nous", titlesInStock: "Titres en stock", whatsapp: "WhatsApp" },
  checkout: {
    eyebrow: "Commande",
    title: "Détails du retrait",
    subtitle: "Paiement en personne au retrait — pas de livraison.",
    name: "Nom",
    emailOrPhone: "Email ou téléphone",
    emailOrPhonePlaceholder: "Pour que la boutique puisse vous contacter",
    note: "Note (facultatif)",
    notePlaceholder: "Heure de retrait préférée, etc.",
    orderSummary: "Résumé de la commande",
    total: "Total",
    pickupNote: "Retrait en boutique uniquement — pas de livraison, paiement en personne.",
    placeOrder: "Valider la commande",
    backToCart: "Retour au panier",
    thanks: (name) => (name ? `Merci, ${name} !` : "Merci !"),
    orderLine: (ref, total) => `Commande ${ref} — ${total}`,
    confirmBody: "Votre commande a été envoyée à la boutique — ils confirmeront le retrait avec vous.",
    keepDigging: "Continuer à explorer →",
    emptyBag: "Votre panier est vide.",
    startDigging: "Commencer à explorer →",
  },
  footer: { contact: "Contact", hours: "Horaires", follow: "Suivez-nous", website: "Site web", copyright: (y, name) => `© ${y} ${name}. Tous droits réservés.`, poweredBy: "Propulsé par" },
  cart: { bagCount: (n) => `Panier (${n})`, empty: "Votre panier est vide", startDigging: "Commencer à explorer →", remove: "Retirer", total: "Total", pickupOnly: "Retrait en boutique uniquement — pas de livraison.", checkout: "Commande" },
};

const de: StoreTranslations = {
  notFound: { title: "Laden nicht gefunden", body: "Dieser Laden existiert nicht oder ist noch nicht öffentlich." },
  nav: { shop: "Shop", accessories: "Zubehör", sellTrade: "Verkaufen/Tauschen", about: "Über uns", bag: "Warenkorb" },
  card: {
    new: "Neu",
    inCart: "Im Warenkorb",
    add: "Hinzufügen",
    untitled: "Ohne Titel",
    unknownArtist: "Unbekannter Künstler",
    outOfStock: "Nicht vorrätig",
    inStockCount: (n) => `${n} vorrätig`,
  },
  carousel: { newArrivals: "Neuheiten", onDiscogs: "Auf Discogs", viewAll: "Alle ansehen" },
  hero: {
    independentShop: (loc) => (loc ? `Unabhängiger Plattenladen · ${loc}` : "Unabhängiger Plattenladen"),
    defaultName: "Plattenladen",
    browseShop: "Shop durchstöbern",
    featuredRelease: "Empfehlung",
    unknown: "Unbekannt",
    newTag: "NEU",
    website: "Webseite",
  },
  home: {
    digByGenre: "Nach Genre stöbern",
    titleCount: (padded, n) => `${padded} Titel`,
    accessories: "Zubehör",
    shopGear: "Zubehör ansehen →",
    sellTradeLabel: "Verkaufen / Tauschen",
    sellTradeHeadline1: "Mach aus deinen Platten",
    sellTradeHeadline2: "Ladenguthaben.",
    sellTradeBody: "Wir kaufen und tauschen Sammlungen jeder Größe. Faire Angebote, keine Tiefstapelei.",
    getOffer: "Angebot anfragen",
    step1Title: "Sag uns, was du hast",
    step1Desc: "Ein Foto oder eine Liste der Highlights reicht.",
    step2Title: "Wir machen ein Angebot",
    step2Desc: "Meist innerhalb von zwei Werktagen.",
    step3Title: "Bargeld oder Guthaben",
    step3Desc: "Bargeld, oder Guthaben mit Aufschlag.",
    theShop: "Der Laden",
    aboutTitle: (name) => `Über ${name}`,
    readOurStory: "Unsere Geschichte lesen",
  },
  shop: {
    eyebrow: "Shop",
    allRecords: "Alle Platten",
    searchPlaceholder: "Künstler, Titel, Label suchen…",
    sortNewest: "Neueste",
    sortPriceAsc: "Preis ↑",
    sortPriceDesc: "Preis ↓",
    sortAZ: "A–Z",
    recordCount: (n, total, filtered) => `${n} Platte${n !== 1 ? "n" : ""}${filtered ? ` von ${total}` : ""}`,
    noMatch: "Keine Platten entsprechen deinen Filtern.",
    noneAvailable: "Derzeit keine Platten verfügbar.",
    clearFilters: "Filter zurücksetzen",
  },
  sidebar: { genreStyle: "Genre / Stil", format: "Format", condition: "Zustand", maxPrice: "Höchstpreis", any: "Beliebig", all: "Alle", clearAll: "Alle Filter zurücksetzen" },
  product: {
    backToShop: "Zurück zum Shop",
    year: "Jahr",
    format: "Format",
    condition: "Zustand",
    catalogNumber: "Katalognr.",
    addToBag: "In den Warenkorb",
    pickupOnly: "Nur Abholung im Laden — kein Versand.",
    tracklist: "Titelliste",
    tracklistUnavailable: "Titelliste nicht verfügbar",
    relatedTitle: "Das könnte dir auch gefallen",
  },
  acc: { eyebrow: "Für dein Setup", title: "Zubehör", allCount: (n) => `Alle (${n})`, none: "Derzeit kein Zubehör verfügbar." },
  sell: {
    eyebrow: "Verkaufen / Tauschen",
    headline1: "Verkauf oder tausche",
    headline2: "deine Platten.",
    body: "Eine Kiste oder eine ganze Sammlung — sag uns, was du hast, und wir melden uns innerhalb von zwei Werktagen mit einem fairen Angebot.",
    yourName: "Dein Name",
    email: "E-Mail",
    approxRecords: "Ungefähre Anzahl an Platten",
    approxPlaceholder: "z. B. 50",
    preferredPayout: "Bevorzugte Auszahlung",
    payoutCash: "Bargeld",
    payoutCredit: "Ladenguthaben",
    payoutEither: "Beides",
    highlights: "Highlights & Zustand",
    highlightsPlaceholder: "Genres, besondere Titel, Pressung oder Zustand…",
    requestOffer: "Angebot anfragen",
    doneTitle: "Danke — wir haben es erhalten",
    doneBody: "Wir melden uns bald wegen deiner Platten.",
    submitAnother: "Weitere Anfrage senden",
  },
  about: { eyebrow: "Der Laden", defaultTitle: "Über uns", titlesInStock: "Titel auf Lager", whatsapp: "WhatsApp" },
  checkout: {
    eyebrow: "Kasse",
    title: "Abholdetails",
    subtitle: "Zahlung persönlich bei Abholung — kein Versand.",
    name: "Name",
    emailOrPhone: "E-Mail oder Telefon",
    emailOrPhonePlaceholder: "Damit dich der Laden erreichen kann",
    note: "Notiz (optional)",
    notePlaceholder: "Bevorzugte Abholzeit usw.",
    orderSummary: "Bestellübersicht",
    total: "Gesamt",
    pickupNote: "Nur Abholung im Laden — kein Versand, Zahlung persönlich.",
    placeOrder: "Bestellung aufgeben",
    backToCart: "Zurück zum Warenkorb",
    thanks: (name) => (name ? `Danke, ${name}!` : "Danke!"),
    orderLine: (ref, total) => `Bestellung ${ref} — ${total}`,
    confirmBody: "Deine Bestellung wurde an den Laden geschickt — die Abholung wird dir bestätigt.",
    keepDigging: "Weiterstöbern →",
    emptyBag: "Dein Warenkorb ist leer.",
    startDigging: "Jetzt stöbern →",
  },
  footer: { contact: "Kontakt", hours: "Öffnungszeiten", follow: "Folgen", website: "Webseite", copyright: (y, name) => `© ${y} ${name}. Alle Rechte vorbehalten.`, poweredBy: "Bereitgestellt von" },
  cart: { bagCount: (n) => `Warenkorb (${n})`, empty: "Dein Warenkorb ist leer", startDigging: "Jetzt stöbern →", remove: "Entfernen", total: "Gesamt", pickupOnly: "Nur Abholung im Laden — kein Versand.", checkout: "Kasse" },
};

const pt: StoreTranslations = {
  notFound: { title: "Loja não encontrada", body: "Esta loja não existe ou ainda não é pública." },
  nav: { shop: "Loja", accessories: "Acessórios", sellTrade: "Vender/Trocar", about: "Sobre", bag: "Carrinho" },
  card: {
    new: "Novo",
    inCart: "No carrinho",
    add: "Adicionar",
    untitled: "Sem título",
    unknownArtist: "Artista desconhecido",
    outOfStock: "Sem estoque",
    inStockCount: (n) => `${n} em estoque`,
  },
  carousel: { newArrivals: "Novidades", onDiscogs: "No Discogs", viewAll: "Ver tudo" },
  hero: {
    independentShop: (loc) => (loc ? `Loja de discos independente · ${loc}` : "Loja de discos independente"),
    defaultName: "Loja de Discos",
    browseShop: "Ver a loja",
    featuredRelease: "Destaque",
    unknown: "Desconhecido",
    newTag: "NOVO",
    website: "Site",
  },
  home: {
    digByGenre: "Buscar por gênero",
    titleCount: (padded, n) => `${padded} título${n !== 1 ? "s" : ""}`,
    accessories: "Acessórios",
    shopGear: "Ver acessórios →",
    sellTradeLabel: "Vender / Trocar",
    sellTradeHeadline1: "Transforme seus discos",
    sellTradeHeadline2: "em crédito na loja.",
    sellTradeBody: "Compramos e trocamos coleções de qualquer tamanho. Ofertas justas, sem subestimar.",
    getOffer: "Pedir uma oferta",
    step1Title: "Nos diga o que você tem",
    step1Desc: "Envie uma foto ou liste os destaques.",
    step2Title: "Fazemos uma oferta",
    step2Desc: "Normalmente em até dois dias úteis.",
    step3Title: "Dinheiro ou crédito",
    step3Desc: "Em dinheiro, ou crédito com um extra.",
    theShop: "A loja",
    aboutTitle: (name) => `Sobre a ${name}`,
    readOurStory: "Conheça nossa história",
  },
  shop: {
    eyebrow: "Loja",
    allRecords: "Todos os discos",
    searchPlaceholder: "Buscar artista, título, gravadora…",
    sortNewest: "Mais recentes",
    sortPriceAsc: "Preço ↑",
    sortPriceDesc: "Preço ↓",
    sortAZ: "A–Z",
    recordCount: (n, total, filtered) => `${n} disco${n !== 1 ? "s" : ""}${filtered ? ` de ${total}` : ""}`,
    noMatch: "Nenhum disco corresponde aos seus filtros.",
    noneAvailable: "Nenhum disco disponível no momento.",
    clearFilters: "Limpar filtros",
  },
  sidebar: { genreStyle: "Gênero / Estilo", format: "Formato", condition: "Condição", maxPrice: "Preço máximo", any: "Qualquer", all: "Todos", clearAll: "Limpar todos os filtros" },
  product: {
    backToShop: "Voltar à loja",
    year: "Ano",
    format: "Formato",
    condition: "Condição",
    catalogNumber: "N.º de catálogo",
    addToBag: "Adicionar ao carrinho",
    pickupOnly: "Somente retirada na loja — sem envio.",
    tracklist: "Lista de faixas",
    tracklistUnavailable: "Lista de faixas não disponível",
    relatedTitle: "Você também pode gostar",
  },
  acc: { eyebrow: "Para seu setup", title: "Acessórios", allCount: (n) => `Todos (${n})`, none: "Nenhum acessório disponível no momento." },
  sell: {
    eyebrow: "Vender / Trocar",
    headline1: "Venda ou troque",
    headline2: "seus discos.",
    body: "Uma caixa ou uma coleção inteira — nos diga o que você tem e voltaremos com uma oferta justa em até dois dias úteis.",
    yourName: "Seu nome",
    email: "Email",
    approxRecords: "Número aproximado de discos",
    approxPlaceholder: "ex. 50",
    preferredPayout: "Pagamento preferido",
    payoutCash: "Dinheiro",
    payoutCredit: "Crédito na loja",
    payoutEither: "Qualquer um",
    highlights: "Destaques e notas de condição",
    highlightsPlaceholder: "Gêneros, títulos de destaque, prensagem ou notas de condição…",
    requestOffer: "Pedir uma oferta",
    doneTitle: "Obrigado — já recebemos",
    doneBody: "Vamos entrar em contato sobre seus discos em breve.",
    submitAnother: "Enviar outro",
  },
  about: { eyebrow: "A loja", defaultTitle: "Sobre nós", titlesInStock: "Títulos em estoque", whatsapp: "WhatsApp" },
  checkout: {
    eyebrow: "Finalizar compra",
    title: "Dados de retirada",
    subtitle: "Pague pessoalmente na retirada — sem envio.",
    name: "Nome",
    emailOrPhone: "Email ou telefone",
    emailOrPhonePlaceholder: "Para a loja poder te contatar",
    note: "Nota (opcional)",
    notePlaceholder: "Horário preferido de retirada, etc.",
    orderSummary: "Resumo do pedido",
    total: "Total",
    pickupNote: "Somente retirada na loja — sem envio, pagamento pessoal.",
    placeOrder: "Confirmar pedido",
    backToCart: "Voltar ao carrinho",
    thanks: (name) => (name ? `Obrigado, ${name}!` : "Obrigado!"),
    orderLine: (ref, total) => `Pedido ${ref} — ${total}`,
    confirmBody: "Enviamos seu pedido à loja — eles vão confirmar a retirada com você.",
    keepDigging: "Continuar buscando →",
    emptyBag: "Seu carrinho está vazio.",
    startDigging: "Começar a buscar →",
  },
  footer: { contact: "Contato", hours: "Horários", follow: "Siga", website: "Site", copyright: (y, name) => `© ${y} ${name}. Todos os direitos reservados.`, poweredBy: "Desenvolvido com" },
  cart: { bagCount: (n) => `Carrinho (${n})`, empty: "Seu carrinho está vazio", startDigging: "Começar a buscar →", remove: "Remover", total: "Total", pickupOnly: "Somente retirada na loja — sem envio.", checkout: "Finalizar compra" },
};

export const STORE_TRANSLATIONS: Record<StoreLang, StoreTranslations> = { en, es, fr, de, pt };

const STORAGE_KEY = "vs_store_lang";

function detectDefaultLang(): StoreLang {
  if (typeof navigator === "undefined") return "en";
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  return (STORE_LANGS.find((l) => l.code === browser)?.code as StoreLang) ?? "en";
}

export function useStoreLang(): [StoreLang, (l: StoreLang) => void] {
  const [lang, setLangState] = useState<StoreLang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (localStorage.getItem(STORAGE_KEY) as StoreLang | null) : null;
    setLangState(stored && STORE_LANGS.some((l) => l.code === stored) ? stored : detectDefaultLang());
  }, []);

  const setLang = useCallback((l: StoreLang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  }, []);

  return [lang, setLang];
}
