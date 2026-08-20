import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY environment variables.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const AVATAR_BUCKET = "avatars";

/**
 * Detects whether a string is a base64 data URI or a raw base64 image.
 */
export function isBase64Image(value: string): boolean {
  return (
    value.startsWith("data:image/") || /^[A-Za-z0-9+/=]{100,}/.test(value) // raw base64 without data: prefix
  );
}

/**
 * Detects whether a string is an HTTP(S) URL pointing to an image
 * (not already in our Supabase storage).
 */
export function isExternalImageUrl(value: string): boolean {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }
  // Already a Supabase storage URL — nothing to do
  if (supabaseUrl && value.startsWith(supabaseUrl)) {
    return false;
  }
  return true;
}

/**
 * Uploads a base64 image to Supabase Storage and returns the public URL.
 */
export async function uploadBase64Avatar(
  userId: string,
  base64: string,
): Promise<string> {
  let mimeType = "image/png";
  let rawBase64 = base64;

  // Parse data URI: data:image/png;base64,iVBOR...
  const dataUriMatch = base64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (dataUriMatch) {
    mimeType = dataUriMatch[1];
    rawBase64 = dataUriMatch[2];
  }

  const ext = mimeType.split("/")[1].replace("+xml", ""); // e.g. png, jpeg, svg
  const filePath = `${userId}/avatar.${ext}`;
  const buffer = Buffer.from(rawBase64, "base64");

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    console.error("[supabase] avatar upload failed:", error);
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Downloads an image from an external URL, uploads it to Supabase Storage,
 * and returns the public URL.
 */
export async function uploadUrlAvatar(
  userId: string,
  imageUrl: string,
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch avatar from URL: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const ext = contentType.split("/")[1]?.replace("+xml", "") || "png";
  const filePath = `${userId}/avatar.${ext}`;
  const buffer = Buffer.from(await response.arrayBuffer());

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("[supabase] avatar URL upload failed:", error);
    throw new Error(`Avatar upload failed: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

  return publicUrl;
}
