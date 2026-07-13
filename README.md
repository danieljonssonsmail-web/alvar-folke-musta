# Äventyrargruppen – Drakar och Demoner

En färdig statisk GitHub Pages-sajt för en spelgrupp i *Drakar och Demoner*. Framsidan byggs automatiskt upp av gruppens karaktärer. **Alvar Folke Musta** är gruppens första karaktär och har ett fullständigt digitalt formulär.

## Innehåll

- gemensam framsida med ett kort för varje karaktär
- direktlänkar vidare till varje spelares egen karaktärssida
- Alvars fullständiga digitala karaktärsblad, bakgrund, inventory och journal
- gruppsida där fler karaktärer, porträtt, bakgrunder, rustningar och PDF-formulär kan läggas till
- import och export av karaktärspaket
- valbar rustning och hjälm med automatiskt skyddsvärde och regler
- privata och offentliga tärningsslag för färdigheter, vapen, skada och valfria tärningar
- erfarenhetsruta framför varje färdighet
- gemensamt initiativbord med kort 1–10, avvakta/byte och vändbara kort
- automatisk lagring i webbläsaren
- responsiv layout för dator och mobil

## Publicera på GitHub Pages

1. Lägg filerna i repositoryt.
2. Gör en commit i GitHub Desktop.
3. Klicka **Push origin**.
4. GitHub Pages uppdateras automatiskt efter någon minut.

Vid en helt ny publicering: **Settings → Pages → Deploy from a branch → main → /(root)**.

## Så fungerar gruppens framsida

`index.html` läser automatiskt Alvars sparade uppgifter och alla karaktärer som skapats eller importerats på `party.html`. När en ny karaktär läggs till visas den på framsidan nästa gång sidan öppnas.

- Alvars kort leder till hans fullständiga digitala formulär.
- Övriga kort leder till den karaktärens egen flik på gruppsidan.
- Länken **Lägg till en karaktär** öppnar formuläret direkt.

## Tärningar och initiativ

På varje digital karaktärssida finns ett tärningsbord. Privata slag sparas bara i den aktuella webbläsaren och visas bara i den karaktärens privata logg. Offentliga slag och initiativbordet delas i realtid mellan enheter som använder samma gruppkod.

Den gemensamma synken använder en publik MQTT-förmedlare. Gruppkoden fungerar som rummets nyckel, så använd en lång och svårgissad kod och dela den bara med spelgruppen. Om nätanslutningen saknas fortsätter privata slag och initiativ att fungera lokalt.

## Sparade data

Textuppgifter sparas lokalt i webbläsarens `localStorage`. Uppladdade porträtt och karaktärsblad sparas i webbläsarens `IndexedDB`. De skrivs inte automatiskt tillbaka till GitHub.

Använd **Exportera karaktärspaket** för att flytta en medspelares karaktär mellan enheter. Alvars fullständiga data kan säkerhetskopieras med **Exportera data**.

## Bilder och privat bruk

Illustrationen och kartan i `assets/images` är hämtade ur uppladdat spelmaterial. Kontrollera utgivarens villkor innan repositoryt eller sajten görs offentlig. För offentligt bruk bör bilderna ersättas med egna eller licensierade bilder.

## Filstruktur

```text
index.html              Gruppens gemensamma framsida
character.html          Alvars fullständiga karaktärsblad
background.html         Alvars bakgrund
inventory.html          Alvars inventory
journal.html            Alvars journal
party.html              Fler karaktärer, import och redigering
initiative.html         Gemensamt initiativbord
assets/css/styles.css   Formgivning
assets/js/home.js       Bygger gruppens framsida
assets/js/party.js      Gruppens karaktärsflikar
assets/js/dice.js       Privata och offentliga tärningsslag
assets/js/initiative.js Gemensamt initiativ och synk
assets/js/app.js        Gemensam lagring och rustningsregler
```
