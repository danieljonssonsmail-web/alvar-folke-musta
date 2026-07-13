# Alvar Folke Musta

En färdig statisk GitHub Pages-sajt för karaktären **Alvar Musta**, oftast känd som **Folke**, i *Drakar och Demoner*.

## Innehåll

- digitalt och redigerbart karaktärsblad
- grundegenskaper, färdigheter, förmågor, magi, vapen och tillstånd
- inventory med obegränsat antal föremål, bärplatser och pengar
- kampanjjournal med datum, plats och etiketter
- automatisk lagring i webbläsarens `localStorage`
- export och import av all speldata som JSON
- originalbladet som PDF
- responsiv layout för dator och mobil

## Publicera på GitHub Pages

1. Skapa ett nytt repository på GitHub, exempelvis `alvar-folke-musta`.
2. Ladda upp **hela innehållet i denna mapp**, inklusive den dolda filen `.nojekyll`.
3. Öppna repositoryts **Settings**.
4. Välj **Pages** i vänstermenyn.
5. Under **Build and deployment**, välj **Deploy from a branch**.
6. Välj grenen `main` och mappen `/ (root)`, och tryck **Save**.
7. Efter någon minut visas adressen till sajten på samma sida.

Startfilen är `index.html`. Ingen installation eller byggprocess behövs.

## Sparade data

Ändringar sparas lokalt i den webbläsare och på den enhet där sajten används. De skickas inte till GitHub. Använd knappen **Exportera data** för säkerhetskopiering eller för att flytta karaktären till en annan enhet. Importera sedan JSON-filen på den nya enheten.

När webbläsardata rensas försvinner den lokala sparningen om ingen export har gjorts.

## Bilder och privat bruk

Illustrationen och kartan i `assets/images` är hämtade ur spelmaterial som laddades upp vid skapandet. Kontrollera utgivarens villkor innan repositoryt eller GitHub Pages-sajten görs offentligt. För privat spelbruk är det säkrast att hålla repositoryt privat eller ersätta bilderna med egna/licensierade bilder.

## Filstruktur

```text
index.html              Översikt
character.html          Karaktärsblad
background.html         Bakgrund
inventory.html          Inventory
journal.html            Journal
assets/css/styles.css   Formgivning
assets/js/              Funktioner och lokal lagring
assets/images/          Bilder och ikon
assets/docs/            Originalbladet som PDF
```
