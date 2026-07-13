# Äventyrargruppen – Drakar och Demoner

En statisk GitHub Pages-sajt för gruppens karaktärer. Version 7 gör Alvar/Folke och alla medspelarkaraktärer till likvärdiga karaktärer i samma portal.

## Det som finns

- Gemensam framsida med ett kort för varje karaktär.
- En komplett karaktärssida per person med flikarna:
  - Översikt
  - Karaktärsblad
  - Bakgrund
  - Inventory
  - Journal
- Privata och offentliga tärningsslag.
- Slag för färdigheter, vapenattacker, vapenskada och valfria tärningar.
- Erfarenhetsruta framför varje färdighet.
- Redigerbara grundegenskaper, resurser, tillstånd, färdigheter, vapen, förmågor och trick.
- Rustning, hjälm, skyddsvärde och rustningsregler.
- Uppladdning av porträtt och originalblad som PDF eller bild.
- Gemensamt initiativbord med initiativkort 1–10.
- Export och import av kompletta karaktärspaket.

## Viktigt om lagringen

GitHub Pages är en statisk webbplats. Uppgifter sparas därför lokalt i webbläsaren på den enhet där de skrivs in.

Ett karaktärspaket innehåller just den karaktärens:

- digitala spelvärden
- bakgrund och anteckningar
- inventory och pengar
- journal
- uppladdat porträtt
- uppladdat karaktärsblad

Spelaren kan exportera paketet från sin egen karaktärssida och skicka JSON-filen till de andra, som importerar den på sidan **Karaktärerna**.

Offentliga tärningsslag och initiativ använder gruppkoden och en extern MQTT-anslutning. Privata slag sparas endast lokalt för den aktuella karaktären.

## Uppdatera GitHub-repositoryt

1. Packa upp uppdateringsfilen.
2. Öppna repositoryt i GitHub Desktop.
3. Välj **Repository → Show in Explorer**.
4. Kopiera innehållet från uppdateringsmappen till repositorymappen.
5. Välj **Ersätt filer**.
6. Skriv exempelvis `Kompletta karaktärssidor för hela gruppen`.
7. Klicka **Commit to main**.
8. Klicka **Push origin**.

Befintliga lokala uppgifter migreras automatiskt. Alvars tidigare inventory och journal ligger kvar, och tidigare importerade medspelarkaraktärer får egna tomma eller importerade inventory- och journalsidor.

## Filer

```text
index.html              Gruppens framsida
party.html              Alla kompletta karaktärssidor och import
initiative.html         Gemensamt initiativbord
character.html          Vidarebefordrar till Alvars karaktärsblad
background.html         Vidarebefordrar till Alvars bakgrund
inventory.html          Vidarebefordrar till Alvars inventory
journal.html            Vidarebefordrar till Alvars journal
assets/js/app.js        Data, migrering och gemensamma funktioner
assets/js/party.js      Karaktärsportalens funktioner
assets/js/dice.js       Tärningsslag och offentlig logg
assets/js/initiative.js Initiativkort
assets/js/home.js       Gruppens framsida
assets/css/styles.css   Utseende och mobilanpassning
```

## Upphovsrätt

Illustrationer och karta från spelmaterial bör endast publiceras enligt utgivarens villkor. För en helt offentlig sida är egna eller licensierade bilder säkrast.
