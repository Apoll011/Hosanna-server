import QRCode from 'qrcode';
import { env } from '../config/env';

/**
 * Builds the payload that gets embedded in the musician QR code. We encode a
 * deep link into the musician-facing app rather than the bare token, so
 * scanning the code with a phone camera opens the app directly. The app is
 * expected to read the `token` query parameter and store it as the Bearer
 * credential for subsequent API calls.
 */
export function buildMusicianAccessUrl(rawToken: string): string {
  const url = new URL('/musician/access', env.musicianToken.publicAppUrl);
  url.searchParams.set('token', rawToken);
  return url.toString();
}

export async function generateQrCodeDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
}
