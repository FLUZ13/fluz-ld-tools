import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countOwnedRunes, createDefaultState, migrateBuilderState, type BuilderState } from "../model";
import { createAnonymousWorkspace, decryptState, formatSyncCode, parseSyncCode } from "../lib/crypto";
import { parseBackup, serializeBackup } from "../lib/backup";
import {
  appendHistory,
  clearHistory,
  listHistory,
  loadState,
  loadWorkspace,
  saveState,
  saveWorkspace,
  type HistoryEntry,
  type SyncWorkspace,
} from "../lib/db";
import { deleteRemoteState, getRemoteState, putRemoteState, SyncConflictError } from "../lib/sync-api";

type SyncStatus = "local" | "saving" | "saved" | "offline" | "conflict";
type ConflictState = { device: BuilderState; cloud: BuilderState; serverRevision: number };

const stateFingerprint = (state: BuilderState) => JSON.stringify(state);

export function useBuilderStore() {
  const [state, setState] = useState<BuilderState>(createDefaultState);
  const [workspace, setWorkspace] = useState<SyncWorkspace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const past = useRef<BuilderState[]>([]);
  const future = useRef<BuilderState[]>([]);
  const stateRef = useRef(state);
  const origin = useMemo(() => crypto.randomUUID(), []);
  const channel = useRef<BroadcastChannel | null>(null);
  const suppressNextSync = useRef(false);
  const lastSyncedFingerprint = useRef("");

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [saved, storedWorkspace] = await Promise.all([loadState(), loadWorkspace()]);
      let nextWorkspace = storedWorkspace ?? createAnonymousWorkspace();
      let nextState = saved?.state ?? createDefaultState();
      let shouldSyncInitialState = Boolean(saved && !storedWorkspace);
      const hashCode = window.location.hash.startsWith("#sync=") ? window.location.hash : "";
      if (hashCode) {
        try {
          nextWorkspace = parseSyncCode(hashCode);
          const remote = await getRemoteState(nextWorkspace);
          nextWorkspace.revision = remote.revision;
          nextState = await decryptState(remote.encryptedState, nextWorkspace);
          shouldSyncInitialState = false;
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        } catch {
          shouldSyncInitialState = false;
          setSyncStatus("offline");
        }
      } else if (storedWorkspace) {
        try {
          const remote = await getRemoteState(storedWorkspace);
          nextWorkspace = { ...storedWorkspace, revision: remote.revision };
          const cloudState = await decryptState(remote.encryptedState, storedWorkspace);
          const cloudFingerprint = stateFingerprint(cloudState);
          const localFingerprint = stateFingerprint(nextState);
          const useCloudState = !saved || cloudState.updatedAt > nextState.updatedAt;
          if (useCloudState) nextState = cloudState;
          shouldSyncInitialState = !useCloudState && cloudFingerprint !== localFingerprint;
          if (!shouldSyncInitialState) {
            setSyncStatus("saved");
          }
        } catch {
          shouldSyncInitialState = false;
          setSyncStatus("offline");
        }
      }
      nextState = migrateBuilderState(nextState);
      if (!shouldSyncInitialState) lastSyncedFingerprint.current = stateFingerprint(nextState);
      await Promise.all([saveWorkspace(nextWorkspace), saveState(nextState)]);
      if (!active) return;
      stateRef.current = nextState;
      setWorkspace(nextWorkspace);
      setState(nextState);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    channel.current = new BroadcastChannel("ld-rune-builder-state");
    channel.current.onmessage = (event: MessageEvent<{ origin: string; state: BuilderState }>) => {
      if (event.data.origin === origin) return;
      if (event.data.state.updatedAt <= stateRef.current.updatedAt) return;
      suppressNextSync.current = true;
      stateRef.current = event.data.state;
      setState(event.data.state);
    };
    return () => channel.current?.close();
  }, [loaded, origin]);

  useEffect(() => {
    if (!loaded) return;
    const saveTimer = window.setTimeout(() => {
      void saveState(state);
      channel.current?.postMessage({ origin, state });
    }, 350);
    const historyTimer = window.setTimeout(() => {
      void appendHistory({
        state,
        createdAt: new Date().toISOString(),
        ownedCount: countOwnedRunes(state),
        assignmentCount: 0,
      }).then(() => setHistoryVersion((version) => version + 1));
    }, 1400);
    return () => { window.clearTimeout(saveTimer); window.clearTimeout(historyTimer); };
  }, [loaded, origin, state]);

  useEffect(() => {
    if (!loaded || !workspace || conflict) return;
    if (suppressNextSync.current) { suppressNextSync.current = false; return; }
    const fingerprint = stateFingerprint(state);
    if (lastSyncedFingerprint.current === fingerprint) return;
    const timer = window.setTimeout(() => {
      setSyncStatus("saving");
      void putRemoteState(workspace, state).then(async (result) => {
        const next = { ...workspace, revision: result.revision };
        await saveWorkspace(next);
        setWorkspace(next);
        lastSyncedFingerprint.current = fingerprint;
        setSyncStatus("saved");
      }).catch(async (error: unknown) => {
        if (error instanceof SyncConflictError) {
          try {
            const remote = await getRemoteState({ ...workspace, revision: error.revision });
            const cloud = await decryptState(remote.encryptedState, workspace);
            setConflict({ device: stateRef.current, cloud, serverRevision: remote.revision });
            setSyncStatus("conflict");
            return;
          } catch { /* fall through to offline */ }
        }
        setSyncStatus("offline");
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [conflict, loaded, state, workspace]);

  const mutate = useCallback((recipe: (draft: BuilderState) => void) => {
    setState((current) => {
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      const next = structuredClone(current);
      recipe(next);
      next.updatedAt = new Date().toISOString();
      stateRef.current = next;
      return next;
    });
    setHistoryVersion((version) => version + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(stateRef.current);
    const next = { ...previous, updatedAt: new Date().toISOString() };
    stateRef.current = next;
    setState(next);
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const nextValue = future.current.pop();
    if (!nextValue) return;
    past.current.push(stateRef.current);
    const next = { ...nextValue, updatedAt: new Date().toISOString() };
    stateRef.current = next;
    setState(next);
    setHistoryVersion((version) => version + 1);
  }, []);

  const refreshHistory = useCallback(async () => setHistory(await listHistory()), []);
  const restoreHistory = useCallback((entry: HistoryEntry) => mutate((draft) => Object.assign(draft, structuredClone(entry.state))), [mutate]);

  const exportBackup = useCallback(() => {
    const blob = new Blob([serializeBackup(stateRef.current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ld-rune-builder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, []);

  const importBackup = useCallback(async (file: File) => {
    const next = parseBackup(await file.text());
    past.current = [...past.current.slice(-49), stateRef.current];
    future.current = [];
    stateRef.current = next;
    setState(next);
    setHistoryVersion((version) => version + 1);
  }, []);

  const importSyncCode = useCallback(async (code: string) => {
    const imported = parseSyncCode(code);
    const remote = await getRemoteState(imported);
    imported.revision = remote.revision;
    const cloud = migrateBuilderState(await decryptState(remote.encryptedState, imported));
    await Promise.all([saveWorkspace(imported), saveState(cloud), clearHistory()]);
    suppressNextSync.current = true;
    lastSyncedFingerprint.current = stateFingerprint(cloud);
    stateRef.current = cloud;
    setWorkspace(imported);
    setState(cloud);
    setConflict(null);
    setSyncStatus("saved");
  }, []);

  const resetWorkspace = useCallback(async () => {
    if (workspace) {
      try { await deleteRemoteState(workspace); } catch { /* local reset still succeeds */ }
    }
    const next = createAnonymousWorkspace();
    await saveWorkspace(next);
    setWorkspace(next);
    setConflict(null);
    setSyncStatus("local");
  }, [workspace]);

  const resolveConflict = useCallback(async (choice: "device" | "cloud" | "newest") => {
    if (!conflict || !workspace) return;
    const selected = migrateBuilderState(choice === "newest"
      ? (conflict.device.updatedAt >= conflict.cloud.updatedAt ? conflict.device : conflict.cloud)
      : conflict[choice]);
    const nextWorkspace = { ...workspace, revision: conflict.serverRevision };
    await saveWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
    setConflict(null);
    setSyncStatus("saving");
    if (selected === conflict.cloud) suppressNextSync.current = true;
    if (selected === conflict.cloud) lastSyncedFingerprint.current = stateFingerprint(selected);
    stateRef.current = selected;
    setState(selected);
  }, [conflict, workspace]);

  return {
    state,
    loaded,
    mutate,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    history,
    historyVersion,
    refreshHistory,
    restoreHistory,
    exportBackup,
    importBackup,
    workspace,
    syncCode: workspace ? formatSyncCode(workspace) : "",
    syncStatus,
    conflict,
    importSyncCode,
    resetWorkspace,
    resolveConflict,
  };
}
