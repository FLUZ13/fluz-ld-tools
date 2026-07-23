import type { BuilderState } from "../model";
import type { SyncWorkspace } from "./db";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createAnonymousWorkspace(): SyncWorkspace {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return {
    workspaceId: crypto.randomUUID(),
    masterKey: toBase64Url(key),
    revision: 0,
    createdAt: new Date().toISOString(),
  };
}

async function deriveKeys(workspace: SyncWorkspace) {
  const material = await crypto.subtle.importKey("raw", fromBase64Url(workspace.masterKey), "HKDF", false, ["deriveKey", "deriveBits"]);
  const salt = encoder.encode(workspace.workspaceId);
  const encryptionKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("ld-rune-builder:encryption:v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("ld-rune-builder:authorization:v1") },
    material,
    256,
  );
  return { encryptionKey, authToken: toBase64Url(new Uint8Array(authBits)) };
}

export async function encryptState(state: BuilderState, workspace: SyncWorkspace) {
  const { encryptionKey, authToken } = await deriveKeys(workspace);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(state));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encryptionKey, plaintext);
  return { encryptedState: `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`, authToken };
}

export async function decryptState(encryptedState: string, workspace: SyncWorkspace) {
  const [ivPart, ciphertextPart] = encryptedState.split(".");
  if (!ivPart || !ciphertextPart) throw new Error("Invalid encrypted state");
  const { encryptionKey } = await deriveKeys(workspace);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivPart) },
    encryptionKey,
    fromBase64Url(ciphertextPart),
  );
  return JSON.parse(decoder.decode(plaintext)) as BuilderState;
}

export async function getAuthToken(workspace: SyncWorkspace) {
  return (await deriveKeys(workspace)).authToken;
}

export function formatSyncCode(workspace: SyncWorkspace) {
  return `LDRB1.${workspace.workspaceId}.${workspace.masterKey}`;
}

export function parseSyncCode(input: string): SyncWorkspace {
  let value = input.trim();
  if (value.includes("#sync=")) value = decodeURIComponent(value.split("#sync=")[1] ?? "");
  const match = /^LDRB1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(value);
  if (!match) throw new Error("That sync code is not valid.");
  return { workspaceId: match[1], masterKey: match[2], revision: 0, createdAt: new Date().toISOString() };
}
