/** Publication ponctuelle vers le Google Drive de l'utilisateur.
 * Le jeton OAuth reste uniquement en mémoire, sans backend ni localStorage.
 * Le scope drive.file évite de demander un accès général aux fichiers Drive.
 */
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** Public OAuth client ID associated with this application's authorized production origin. */
const PUBLIC_GOOGLE_OAUTH_CLIENT_ID = "259896668724-htqe8i37ka5hnopjq3iqaiasuh47787o.apps.googleusercontent.com";

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string; scope?: string };
type GoogleTokenClient = { requestAccessToken(options?: { prompt?: string }): void };
type GoogleOauth = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (reason: { type?: string }) => void;
  }): GoogleTokenClient;
};
declare global {
  interface Window { google?: { accounts?: { oauth2?: GoogleOauth } } }
}

export interface GoogleSlidesResult {
  id: string;
  name: string;
  url: string;
}

export function isValidGoogleClientId(value: string): boolean {
  return /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(value.trim());
}

export function getGoogleClientId(): string {
  // L'identifiant OAuth est public : configuré par l'éditeur, jamais saisi par l'utilisateur.
  return (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || PUBLIC_GOOGLE_OAUTH_CLIENT_ID).trim();
}

export function requestGoogleDriveAccess(clientId: string): Promise<string> {
  if (!isValidGoogleClientId(clientId)) throw new Error("La connexion Google n'est pas correctement configurée dans l'application.");
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error("La connexion Google n'est pas encore chargée. Vérifiez les bloqueurs de scripts et réessayez.");
  return new Promise<string>((resolve, reject) => {
    let completed = false;
    const finish = (error?: Error, value?: string) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value || "");
    };
    const timeout = window.setTimeout(() =>
      finish(new Error("La connexion Google a expiré. Relancez l'export.")), 120000);
    try {
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: response => {
          if (response.error || !response.access_token) {
            finish(new Error("Autorisation Google refusée ou incomplète : " +
              (response.error_description || response.error || "jeton absent")));
          } else {
            finish(undefined, response.access_token);
          }
        },
        error_callback: reason => finish(new Error(
          reason.type === "popup_closed" ? "La fenêtre de connexion Google a été fermée." :
          reason.type === "popup_failed_to_open" ? "Autorisez les fenêtres contextuelles pour vous connecter à Google." :
          "Connexion Google interrompue. Réessayez.")),
      });
      // Le déclenchement doit rester synchrone avec le clic pour éviter les popups bloquées.
      client.requestAccessToken({ prompt: "select_account" });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Connexion Google indisponible."));
    }
  });
}

/** Encodage multipart/related attendu par Drive API files.create, avec conversion native Slides. */
export function makeGoogleUploadBody(pptx: Blob, name: string, boundary: string) {
  if (!/^[a-z0-9_-]{8,100}$/i.test(boundary)) throw new Error("Frontière multipart invalide.");
  const metadata = JSON.stringify({
    name: name.trim().slice(0, 200) || "Présentation sans titre",
    mimeType: GOOGLE_SLIDES_MIME,
  });
  return new Blob([
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
    metadata,
    "\r\n--" + boundary + "\r\nContent-Type: " + PPTX_MIME + "\r\n\r\n",
    pptx,
    "\r\n--" + boundary + "--\r\n",
  ], { type: "multipart/related; boundary=" + boundary });
}

export function googleSlidesEditUrl(id: string): string {
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new Error("Google a retourné un identifiant de fichier invalide.");
  return "https://docs.google.com/presentation/d/" + id + "/edit";
}

function googleUploadError(status: number, message: string): Error {
  const detail = message.slice(0, 350);
  if (status === 401) return new Error("La connexion Google a expiré. Relancez l'export.");
  if (status === 403) return new Error(
    "Google refuse l'import. Vérifiez que l'API Google Drive est activée, que votre compte a accès à l'application OAuth et que l'autorisation drive.file est accordée. " + detail);
  if (status === 413) return new Error("Le fichier est trop volumineux pour cet import Google.");
  return new Error("Google Drive a refusé l'import (HTTP " + status + "). " + detail +
    " Vérifiez votre Drive avant de réessayer afin d'éviter les doublons.");
}

/** Un seul import par clic. Aucun retry automatique en cas de résultat réseau incertain. */
export async function uploadPowerPointToGoogleSlides(
  accessToken: string, pptx: Blob, name: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleSlidesResult> {
  if (!accessToken) throw new Error("Autorisation Google manquante.");
  if (pptx.size < 800) throw new Error("Le PowerPoint est vide ou invalide.");
  const boundary = "singe_" + crypto.randomUUID().replace(/-/g, "");
  const body = makeGoogleUploadBody(pptx, name, boundary);
  let response: Response;
  try {
    response = await fetcher(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "multipart/related; boundary=" + boundary,
        },
        body,
        signal: AbortSignal.timeout(180000),
      },
    );
  } catch {
    throw new Error("Impossible de confirmer la conversion Google Slides. Vérifiez d'abord votre Drive pour éviter un doublon avant de réessayer.");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result?.error?.message === "string" ? result.error.message : "";
    throw googleUploadError(response.status, message);
  }
  if (result?.mimeType !== GOOGLE_SLIDES_MIME || typeof result?.id !== "string") {
    throw new Error("Google Drive n'a pas confirmé la conversion en présentation Google Slides. Vérifiez le fichier créé dans votre Drive.");
  }
  return {
    id: result.id,
    name: typeof result.name === "string" ? result.name : name,
    url: googleSlidesEditUrl(result.id),
  };
}
