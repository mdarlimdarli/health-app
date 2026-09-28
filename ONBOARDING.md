# Einrichtung

So richtest du die App für dich oder eine andere Person ein. Jede Person nutzt einen eigenen Fork und ein eigenes privates Daten-Repo. Welche Felder das Profil hat, steht in [PROFILE.md](PROFILE.md).

1. **Fork anlegen.** Auf GitHub das Repo `health-app` öffnen und oben rechts auf **Fork** tippen.
2. **Actions und Pages einschalten.** Im Fork unter **Actions** die Workflows erlauben (bei Forks sind sie zuerst aus). Dann unter **Settings > Pages > Source** die Option **GitHub Actions** wählen.
3. **Eigenes Daten-Repo für die Sicherung.** Ein neues, **privates** Repo anlegen, es darf leer bleiben. Der Standardname ist `health-data`. Du kannst jeden anderen Namen wählen, zum Beispiel wenn mehrere Personen unter einem GitHub-Konto sichern (`health-data-2`). Den Namen trägst du später in der App ein.
4. **Eigenen Token erstellen.** Unter GitHub **Settings > Developer settings > Fine-grained tokens** einen Token nur für dein Daten-Repo mit **Contents: Read and write** erstellen. Den Token nie ins Repo schreiben, er gehört nur in die App.
5. **Auf dem iPhone installieren.** `https://<github-name>.github.io/health-app/` in Safari öffnen und wie in der [README](README.md) beschrieben zum Home-Bildschirm hinzufügen.
6. **Profil anlegen.** Beim ersten Start die Einrichtung ausfüllen. Oder vorher `data/profile.example.json` kopieren, anpassen, auf das iPhone legen (zum Beispiel über iCloud Drive) und in der Einrichtung „Profil importieren“ wählen. Diese Datei nicht committen.
7. **Sicherung verbinden.** In der App oben rechts die Einstellungen öffnen und unter GitHub eintragen:
   - **Owner:** dein GitHub-Name
   - **Daten-Repo:** der Name aus Schritt 3, leer lassen für `health-data`
   - **Token:** der Token aus Schritt 4

   Unter dem Feld zeigt die App den vollständigen Pfad als Vorschau, zum Beispiel `beispiel/health-data-2`. Prüf ihn, speichere, setz ein Passwort und tippe einmal „Jetzt sichern“. Ab dann steckt das Profil in der Sicherung.
8. **Trainingsplan anpassen.** Die App erzeugt die Pläne selbst aus `training` im Profil. Persönliche Einschränkungen gehören als Schonungen (`avoidTags`) ins Profil, nicht in die Übungsbibliothek `data/exercises.json`. In der App lässt sich jede Übung per „Alternative“ dauerhaft tauschen oder per „Mag ich nicht“ ausschließen. Wer den Plan komplett von Hand festlegen will, legt `data/plans.json` im Format von `data/plans.generated.json` an. Sie ist dann öffentlich, also ohne persönliche Hinweise.

**Updates aus dem Original holen:** Auf GitHub im Fork **Sync fork** nutzen. Da kein Profil im Repo liegt, gibt es dabei keine Konflikte mit persönlichen Daten.
