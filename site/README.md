# Scheidung Online Direkt — Website

Statische Website, fertig für Vercel.

## Struktur
- `index.html` — Startseite
- `scheidung-vorbereiten.html` — Online-Antrag (8-Schritt-Wizard, sendet an Make.com)
- `styles.css`, `wizard.css` — Styles
- `app.jsx`, `tweaks-panel.jsx` — Interaktivität der Startseite
- `assets/` — Logos & Bild

## Deployen
Kein Build nötig — reine statische Dateien.

1. Diesen Ordner in ein Git-Repo legen und zu Vercel pushen
   (oder per Vercel CLI: `vercel` im Ordner ausführen).
2. Vercel erkennt das Projekt automatisch als "Other / Static".
   Output Directory: Projekt-Root (dieser Ordner). Build Command: leer.

Die Startseite ist `/`, der Antrag liegt unter `/scheidung-vorbereiten.html`.

## Make.com Webhook
Die Antragsdaten werden in `scheidung-vorbereiten.html` per `fetch()`
als JSON an den Webhook gesendet (Variable `MAKE_WEBHOOK_URL`, ganz oben
im `<script>`-Block). Aktuell gesetzt auf den produktiven Hook.
