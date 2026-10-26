/* ==========================================================
 * useStore.js —— React 与 store 的桥接
 * store 内部是可变对象，通过 version 计数触发 React 重渲染
 * ========================================================== */
import { useSyncExternalStore, useEffect, useRef } from 'react';
import { subscribe, getVersion, state, on } from './store.js';

/** 订阅整个 store，数据变化即重渲染 */
export function useStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

/** 订阅某个具名事件（log / run:start / run:end / toast 等） */
export function useEvent(evt, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(evt, (payload) => ref.current && ref.current(payload)), [evt]);
}
