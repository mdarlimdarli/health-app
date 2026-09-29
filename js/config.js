/*
  Öffentliche Konfiguration der App. Alles hier darf im Repo stehen.
  VAPID_PUBLIC_KEY: öffentlicher Schlüssel für Web Push. Der private Gegenpart liegt nur
  als Secret VAPID_PRIVATE_KEY im Daten-Repo und lokal in .vapid-private (ignoriert).
  Wer die App forkt, erzeugt ein eigenes Schlüsselpaar (siehe ONBOARDING.md) und trägt
  hier den eigenen öffentlichen Schlüssel ein. Leer heißt: Eingabefeld in den Einstellungen.
*/

export const VAPID_PUBLIC_KEY = 'BFuwo-_QFaN0TT1qV4jnccM_73guRiMe5BVwhM1cMX5ZUMu6JNqUHe5rVNSFJfjo8rUI2_stS0uZiC8MnKwPN6s';
