# 01 — Was ist die Textil-Plattform?

- **Arbeitstitel:** Was ist die Textil-Plattform?
- **YouTube-Titel:** Was ist die Textil-Plattform? Web- und Perlenmuster im Browser (DB-WEAVE & JBead)
- **YouTube-Beschreibung:** Die Textil-Plattform bringt die kostenlosen Entwurfsprogramme DB-WEAVE (Weben auf Schaftwebstühlen) und JBead (gehäkelte Perlenketten) in den Browser – ohne Installation, auf jedem Gerät, auch auf dem Tablet. In diesem Video sehen wir uns die öffentlichen Beispielmuster an, erstellen Schritt für Schritt ein kostenloses Konto und stellen Sprache, Erscheinungsbild und Zeitzone ein. Teil 1 der Tutorial-Reihe zur Textil-Plattform auf textil-plattform.ch.
- **Ziellänge:** etwa 7:30
- **Zielgruppe:** alle – Einsteigerinnen und Einsteiger ins Weben oder Perlenhäkeln sowie Benutzer der Desktop-Programme DB-WEAVE oder JBead
- **Lernziele:**
  - Wissen, was DB-WEAVE und JBead sind und was die Textil-Plattform ergänzt (Browser, jedes Gerät, Gruppen, Teilen, Chat).
  - Die öffentlichen Beispielmuster ohne Konto ansehen.
  - Sich registrieren, die E-Mail-Adresse bestätigen und mit E-Mail und Passwort anmelden.
  - Die Willkommensnachricht, die zwei Startmuster und den Link Hilfe kennen.
  - Erscheinungsbild, Sprache und Zeitzone im Profil einstellen.

## Demo-Vorbereitung

- Saubere lokale Video-Instanz gemäss [README](../README.md) (Datenbank `textile_video`, `SHOW_VERIFICATION_CODE=1`, produktive `STARTER_*`-Werte, lokaler SMTP-Sink mit Web-Posteingang).
- Aufnahme-Browserprofil mit **Browsersprache Deutsch** (die Startseite ohne Anmeldung und die Sprache des neuen Kontos – und damit die deutschen Startmuster – richten sich nach der Browsersprache). Abgemeldet, keine Cookies aus früheren Testläufen.
- Es existiert noch kein Konto `carla-muster` und kein Konto mit `carla.muster@example.com` (Reste aus Proben mit `flask --app textileplatform delete-user carla-muster` löschen).
- Zweiter Browser-Tab: der Web-Posteingang des lokalen SMTP-Sinks, leer.
- Ein vorbereitetes Passwort für Carla (mindestens 8 Zeichen, nicht trivial); es wird nur in maskierte Felder getippt.
- Für Szene 2: kurze Bildschirmaufnahmen oder Screenshots der Desktop-Programme DB-WEAVE und JBead (z. B. von brunoldsoftware.ch).
- Hinweis: Mit `SHOW_VERIFICATION_CODE=1` zeigt die Seite *Die Verifikation des Kontos ist hängig* einen Kasten «Hilfe für lokale Tests». Diesen aus dem Bild halten oder im Schnitt unkenntlich machen; die Szene verwendet den Link in der E-Mail.
- Erscheinungsbild zu Beginn: hell (die Profilszene schaltet auf Dunkel und wieder zurück auf Hell).

## Szenen

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Titelkarte «Was ist die Textil-Plattform?», dann der Browser mit textil-plattform.ch (abgemeldet, Beispielsammlung). | Hallo und herzlich willkommen! In dieser Reihe zeige ich Ihnen die Textil-Plattform. Das ist eine Website, auf der Sie Webmuster und Perlenmuster direkt im Browser entwerfen. In diesem ersten Video erfahren Sie, was die Plattform ist, woher sie kommt und wie Sie Ihr eigenes kostenloses Konto erstellen. Legen wir los. |
| 2 | 00:28 | Bildschirmaufnahmen der Desktop-Programme: DB-WEAVE mit einem Entwurf (Einzug, Aufknüpfung, Trittfolge, Gewebe), dann JBead mit einem Perlenkettenmuster. Einblendung «Brunold Software — DB-WEAVE · JBead». | Die Textil-Plattform baut auf zwei Programmen von Brunold Software auf, einem kleinen Schweizer Entwickler von kostenlosen Entwurfsprogrammen. Das erste ist DB-WEAVE. Es ist eine Software zum Weben auf Schaftwebstühlen. Sie entwerfen den Einzug, die Aufknüpfung und die Trittfolge, und DB-WEAVE zeigt Ihnen das entstehende Gewebe. Das zweite ist JBead. Es ist ein Entwurfsprogramm für gehäkelte Perlenketten. Sie zeichnen das Muster auf einem Raster, und JBead zeigt, wie die fertige Kette aussieht und in welcher Reihenfolge Sie die Perlen auffädeln. Beide Programme sind kostenlos und quelloffen und laufen unter Windows, macOS und Linux. |
| 3 | 01:18 | Einfache Grafik: ein Desktop-Computer, ein Laptop und ein Tablet, jeweils mit demselben Muster im Browser; darunter drei Symbole: Gruppen, Teilen, Chat. | Warum also eine Website? Desktop-Programme müssen installiert werden, und auf einem Tablet laufen sie nicht. Die Textil-Plattform bringt dieselben Entwurfsfunktionen in Ihren Browser. Sie müssen nichts installieren, und es funktioniert auf jedem Gerät, auch auf dem Tablet. Ihre Muster sind online gespeichert, so dass Sie jederzeit an einem anderen Computer weiterarbeiten können. Und die Plattform kann etwas, das die Desktop-Programme nicht können: Sie können Gruppen erstellen, Muster mit anderen teilen und mit ihnen chatten. Das ist praktisch für Webkurse, Vereine oder einfach für Freundinnen und Freunde, die gemeinsam entwerfen. |
| 4 | 02:03 | Browser: textil-plattform.ch öffnen (abgemeldet). Die Startseite zeigt die öffentliche Beispielsammlung. Von **DB-WEAVE Muster** hinunter zu **JBead Muster** scrollen. Ein Webmuster-Beispiel anklicken → es öffnet sich schreibgeschützt. **Schliessen** klicken. Ein Perlenmuster-Beispiel anklicken → schreibgeschützter Perlen-Editor. **Schliessen** klicken. | Schauen wir es uns an. Wenn Sie textil-plattform.ch öffnen, ohne angemeldet zu sein, sehen Sie eine öffentliche Sammlung von Beispielmustern. Oben stehen die DB-WEAVE Muster, weiter unten die JBead Muster. Sie können jedes davon öffnen, auch ohne Konto. Hier ist ein Webmuster. Sie sehen den ganzen Entwurf: Einzug, Aufknüpfung, Trittfolge und das Gewebe. Dieses Muster gehört jemand anderem, darum öffnet es sich schreibgeschützt. Sie können alles ansehen, aber nichts ändern. Mit Schliessen kommen Sie zurück. Und hier ist ein Perlenmuster. Links der Entwurf, daneben die korrigierte Ansicht und die Simulation der fertigen Kette. Wieder Schliessen. |
| 5 | 03:00 | **Registrieren** klicken (oben rechts). Seite **Konto erstellen**. **Name** «Carla Muster», **E-Mail** «carla.muster@example.com», **Passwort**, **Passwort bestätigen** ausfüllen, dann das Ergebnis der Rechnung bei «Bitte geben Sie das Ergebnis der folgenden Rechnung ein». **Erstellen** klicken. | Um eigene Muster zu entwerfen, brauchen Sie ein kostenloses Konto. Klicken Sie oben rechts auf Registrieren. Die Seite heisst Konto erstellen. Zuerst der Name. Das ist der Name, den andere Benutzer sehen. Ich tippe Carla Muster. Aus diesem Namen erstellt die Plattform auch die kurze Webadresse Ihrer Muster, hier carla-muster. Dann die E-Mail-Adresse. Danach ein Passwort mit mindestens acht Zeichen, und unter Passwort bestätigen dasselbe Passwort noch einmal. Zum Schluss eine kleine Rechnung. Sie stellt sicher, dass sich ein Mensch registriert und kein Roboter. Ich gebe das Ergebnis ein und klicke auf Erstellen. |
| 6 | 03:56 | Seite **Die Verifikation des Kontos ist hängig** mit der E-Mail-Adresse (Hilfekasten ausserhalb des Bildes). Zum Posteingangs-Tab wechseln: die E-Mail «Textil-Plattform-Konto bestätigen» öffnen, den Link anklicken. Seite **Verifikation erfolgreich** → **Anmelden** klicken. | Die Seite meldet jetzt: Die Verifikation des Kontos ist hängig. Die Plattform hat eine E-Mail an die eingegebene Adresse geschickt. Öffnen wir das Postfach. Die E-Mail heisst Textil-Plattform-Konto bestätigen, und sie enthält einen Link. Ich klicke darauf, und das Konto ist bestätigt. Falls Sie die E-Mail nicht finden, schauen Sie bitte im Spam-Ordner nach. Die Seite meldet jetzt: Verifikation erfolgreich. Klicken Sie auf Anmelden. |
| 7 | 04:34 | Seite **Anmelden**: **E-Mail** und **Passwort** eintippen, auf **Passwort wiederherstellen** zeigen, **Anmelden** klicken. | Zum Anmelden verwenden Sie Ihre E-Mail-Adresse und Ihr Passwort, nicht Ihren Namen. Falls Sie Ihr Passwort einmal vergessen, klicken Sie auf Passwort wiederherstellen, und die Plattform schickt Ihnen einen Link für ein neues Passwort. Jetzt klicke ich auf Anmelden. |
| 8 | 04:57 | Willkommensfenster **Willkommen auf der Textil-Plattform!** Jeden Punkt hervorheben, während er erwähnt wird. Auf **Hilfe** in der oberen Leiste zeigen. **Verstanden** klicken. | Beim ersten Besuch erscheint eine Willkommensnachricht. Sie erklärt ein paar Dinge. In Ihr Konto wurden zwei Beispielmuster gelegt, ein Webmuster und ein Perlenmuster. Wenn Sie eine Frage haben, können Sie jederzeit dem Support-Benutzer schreiben. Der Link Hilfe in der oberen Leiste öffnet genau diesen Chat. Anderen Benutzern können Sie von deren Profilseite aus Direktnachrichten schicken. Und Sie können Gruppen erstellen, andere einladen, Muster teilen und gemeinsam chatten. Mit Verstanden schliessen Sie die Nachricht. Sie erscheint nicht wieder. |
| 9 | 05:40 | Carlas Musterseite: auf «Doppelgewebe» unter **DB-WEAVE Muster** und «Grün Gelb Diagonal» unter **JBead Muster** zeigen. «Doppelgewebe» anklicken → der Editor öffnet sich; **Schliessen** klicken. | Jetzt sind wir auf Carlas eigener Musterseite. Hier sind die zwei Startmuster: Doppelgewebe bei den DB-WEAVE Mustern und Grün Gelb Diagonal bei den JBead Mustern. Das sind Ihre eigenen Kopien. Sie können sie also öffnen, ändern und damit experimentieren, so viel Sie möchten. Wenn Sie sie nicht brauchen, löschen Sie sie einfach. Diese Seite schauen wir uns im nächsten Video genau an. |
| 10 | 06:13 | Den runden Profilknopf mit den Initialen «CM» anklicken (oben rechts) → **Profil**. Unter **Erscheinungsbild** auf **Dunkel**, dann **System**, dann **Hell** klicken. **Sprache** aufklappen (Systemvorgabe / Deutsch / English), Deutsch lassen. **Zeitzone** aufklappen, «Europe/Zurich» wählen. Auf die nicht änderbaren Felder **Name** und **E-Mail** zeigen. **Speichern** klicken. | Noch ein letzter Halt: Ihr Profil. Klicken Sie oben rechts auf den runden Knopf mit Ihren Initialen. Unter Erscheinungsbild wählen Sie Hell, Dunkel oder System. System richtet sich einfach nach der Einstellung Ihres Computers oder Tablets. Unter Sprache wählen Sie Deutsch oder English. Systemvorgabe verwendet die Sprache Ihres Browsers. Die Zeitzone bestimmt, wie Datum und Uhrzeit angezeigt werden, zum Beispiel bei Nachrichten. Wenn alles passt, klicken Sie auf Speichern. Ihr Name oben erscheint in den Webadressen Ihrer Muster. Ihn und Ihre E-Mail-Adresse kann nur der Support ändern. |
| 11 | 06:57 | Zurück zur Musterseite (Logo anklicken). Abspann mit Links zu Video 02 und Video 10. | Das war das erste Video. Carla hat jetzt ein Konto, zwei Startmuster, und ihre Einstellungen sind gemacht. Arbeiten Sie bereits mit DB-WEAVE oder JBead auf dem Desktop? Dann zeigt Ihnen Video 10, wie Sie Ihre bestehenden Dateien auf die Plattform bringen. Im nächsten Video erkunden wir Ihre Mustersammlung: Muster erstellen, hochladen, sortieren und verwalten. Bis gleich! |

## YouTube-Kapitel

```
00:00 Willkommen
00:28 DB-WEAVE und JBead
01:18 Die Idee der Textil-Plattform
02:03 Öffentliche Beispielmuster
03:00 Ein Konto erstellen
03:56 Die E-Mail-Adresse bestätigen
04:34 Anmelden
04:57 Die Willkommensnachricht
05:40 Ihre zwei Startmuster
06:13 Profil: Erscheinungsbild, Sprache, Zeitzone
06:57 Wie es weitergeht
```

## Nächstes Video

**02 — Ihre Mustersammlung:** Muster erstellen und hochladen, filtern und sortieren, und die Aktionen zum Umbenennen, Veröffentlichen, Herunterladen, Klonen und Löschen. Desktop-Benutzer: siehe auch **10 — Für Benutzer von DB-WEAVE und JBead auf dem Desktop**.
