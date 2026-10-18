// Document state with undo/redo. Edits are written as mutations on a fresh clone.

import { useCallback, useRef, useState } from 'react';
import type { Doc } from '../model/types';

const LIMIT = 200;

interface HistoryState {
  past: Doc[];
  present: Doc;
  future: Doc[];
}

export interface DocHistory {
  doc: Doc;
  canUndo: boolean;
  canRedo: boolean;
  /** One undoable edit. */
  commit: (mutate: (draft: Doc) => void) => void;
  /** Replace the whole document (undoable). */
  replace: (doc: Doc) => void;
  /**
   * Continuous edits (dragging): every `gesture` call re-applies `mutate` to the document
   * as it was when the gesture started, and the whole gesture is a single undo step.
   */
  gesture: (mutate: (draft: Doc) => void) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
}

export function useDocHistory(initial: () => Doc): DocHistory {
  const [state, setState] = useState<HistoryState>(() => ({ past: [], present: initial(), future: [] }));
  const gestureBase = useRef<Doc | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const commit = useCallback((mutate: (draft: Doc) => void) => {
    setState((s) => {
      const next = structuredClone(s.present);
      mutate(next);
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const replace = useCallback((doc: Doc) => {
    gestureBase.current = null;
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: doc, future: [] }));
  }, []);

  const gesture = useCallback((mutate: (draft: Doc) => void) => {
    const starting = gestureBase.current === null;
    if (starting) gestureBase.current = latest.current.present;
    const base = gestureBase.current!;
    setState((s) => {
      const next = structuredClone(base);
      mutate(next);
      return {
        past: starting ? [...s.past, s.present].slice(-LIMIT) : s.past,
        present: next,
        future: [],
      };
    });
  }, []);

  const endGesture = useCallback(() => {
    gestureBase.current = null;
  }, []);

  const undo = useCallback(() => {
    gestureBase.current = null;
    setState((s) =>
      s.past.length === 0
        ? s
        : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] },
    );
  }, []);

  const redo = useCallback(() => {
    gestureBase.current = null;
    setState((s) =>
      s.future.length === 0
        ? s
        : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) },
    );
  }, []);

  return {
    doc: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    replace,
    gesture,
    endGesture,
    undo,
    redo,
  };
}
