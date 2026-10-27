/* ==========================================================
 * App.jsx —— 画布主容器
 * ----------------------------------------------------------
 * 负责：
 *   1. 视口（平移 / 缩放 / 适应 / 定位）
 *   2. 交互（节点拖拽、框选、缩放节点、连线、删除、复制）
 *   3. 调度执行引擎与状态显示
 *   4. 组装 Canvas2D 层（网格/连线/小地图）与 DOM 节点层
 * ========================================================== */
import React, {
  useState, useRef, useEffect, useCallback, useSyncExternalStore
} from 'react';

import {
  state, subscribe, getVersion, NODE_TYPES,
  addNode, addEdge, removeNodes, removeEdges, updateNodeData, updateNode,
  commit, undo, redo, canUndo, canRedo,
  load, loadDemo, exportJSON, importJSON, reset,
  getChannel, getNode, uid, removeAgent, removeChannel
} from './lib/store.js';
import * as Engine from './lib/engine.js';
import * as Api from './lib/api.js';
import { hitTestEdge, toWorld } from './canvas/geometry.js';

import GridCanvas from './canvas/GridCanvas.jsx';
import EdgeCanvas from './canvas/EdgeCanvas.jsx';
import Minimap from './canvas/Minimap.jsx';
import Gallery3D from './canvas/Gallery3D.jsx';

import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Inspector from './components/Inspector.jsx';
import NodeCard from './components/NodeCard.jsx';
import Toasts from './components/Toasts.jsx';
import { ChannelModal, AgentModal } from './components/Modals.jsx';

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

export default function App() {
  /* ---------------- store 订阅 ---------------- */
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const st = state;

  /* ---------------- 视图状态 ---------------- */
  const [vp, setVp] = useState(() => ({ ...st.viewport }));
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [selection, setSelection] = useState([]);
  const [selEdges, setSelEdges] = useState([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState('prop');
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);       // {type:'channel'|'agent'|'image', id}
  const [showGallery, setShowGallery] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [tempLink, setTempLink] = useState(null);
  const [marquee, setMarquee] = useState(null);
  /* 工具：hand = 抓手（空白拖拽平移，默认）；select = 框选 */
  const [tool, setTool] = useState('hand');

  const wrapRef = useRef(null);
  const spaceRef = useRef(false);
  const dragRef = useRef({ mode: null });
  const fileRef = useRef(null);
  const vpRef = useRef(vp);          // 交互回调读最新视口，避免闭包过期
  const rafRef = useRef(0);          // 鼠标事件按帧合并，避免每次 mousemove 都重渲染
  const pendingRef = useRef(null);

  /* ---------------- toast ---------------- */
  const toast = useCallback((msg, level = '') => {
    const id = uid('t');
    setToasts((t) => t.concat({ id, msg, level }));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), level === 'err' ? 6000 : 3000);
  }, []);
  const removeToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------------- 初始化：读本地 or 示例 ---------------- */
  useEffect(() => {
    const ok = load();
    if (!ok || !st.nodes.length) loadDemo();
    else setVp({ ...st.viewport });
    // 等布局稳定后自动适应视图，避免首次打开看不到节点
    const t = setTimeout(fitNow, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, []);

  /* ---------------- 尺寸监听 ---------------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /* ---------------- 视口持久化（不进历史） ---------------- */
  useEffect(() => {
    vpRef.current = vp;
    st.viewport = { ...vp };
  }, [vp, st]);

  /* ---------------- 滚轮：缩放 / 平移 ---------------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    /** 只有「真的能滚动」的元素才吞掉滚轮（如文本溢出的 textarea），
     *  否则在节点上滚动也应该缩放画布 —— 这是 Figma / tldraw 的手感 */
    const canScroll = (node) => {
      let cur = node;
      while (cur && cur !== document.body && cur !== el) {
        if (cur.nodeType === 1) {
          const s = getComputedStyle(cur);
          const oy = s.overflowY;
          const ox = s.overflowX;
          if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 1) return true;
          if ((ox === 'auto' || ox === 'scroll') && cur.scrollWidth > cur.clientWidth + 1) return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const onWheel = (e) => {
      if (e.target && e.target.nodeType === 1 && canScroll(e.target)) return; // 让元素自己滚

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // 统一成像素，兼容 Firefox 的「按行/按页」滚动
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      // Shift + 滚轮 → 横向平移；触摸板横扫 → 平移，都不缩放
      if (e.shiftKey) {
        setVp((v) => ({ ...v, x: v.x - dy }));
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 3) {
        setVp((v) => ({ ...v, x: v.x - dx }));
        return;
      }

      setVp((v) => {
        const factor = Math.exp(-dy * 0.0015);
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        if (next === v.scale) return v;
        // 保持鼠标下的世界点不动
        const wx = (mx - v.x) / v.scale;
        const wy = (my - v.y) / v.scale;
        return { scale: next, x: mx - wx * next, y: my - wy * next };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ---------------- 全局鼠标移动 / 抬起 ---------------- */
  useEffect(() => {
    /** 按帧合并渲染：一帧内多次 mousemove 只触发一次重绘，拖拽/平移明显更跟手 */
    const schedule = (fn) => {
      pendingRef.current = fn;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const f = pendingRef.current;
        pendingRef.current = null;
        if (f) f();
      });
    };
    const flush = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      const f = pendingRef.current;
      pendingRef.current = null;
      if (f) f();
    };

    const onMove = (e) => {
      const d = dragRef.current;
      if (!d.mode) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { scale } = vpRef.current;

      if (d.mode === 'pan') {
        const dx = e.clientX - d.startScreen.x;
        const dy = e.clientY - d.startScreen.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        const nx = d.startVp.x + dx;
        const ny = d.startVp.y + dy;
        schedule(() => setVp((v) => (v.x === nx && v.y === ny ? v : { ...v, x: nx, y: ny })));
      } else if (d.mode === 'move') {
        const dx = (e.clientX - d.startClient.x) / scale;
        const dy = (e.clientY - d.startClient.y) / scale;
        d.moved = true;
        schedule(() => {
          Object.keys(d.nodeStart).forEach((id) => {
            const n = getNode(id);
            if (!n) return;
            const s = d.nodeStart[id];
            n.x = Math.round(s.x + dx);
            n.y = Math.round(s.y + dy);
          });
          // 直接改对象后需要触发重渲染（不写历史）
          setVp((v) => ({ ...v }));
        });
      } else if (d.mode === 'resize') {
        d.moved = true;
        schedule(() => {
          const n = getNode(d.resizeId);
          if (n) {
            n.w = Math.max(140, d.startSize.w + (e.clientX - d.startClient.x) / scale);
            n.h = Math.max(90, d.startSize.h + (e.clientY - d.startClient.y) / scale);
            setVp((v) => ({ ...v }));
          }
        });
      } else if (d.mode === 'link') {
        schedule(() => setTempLink({ sourceId: d.linkSourceId, point: { x: sx, y: sy } }));
      } else if (d.mode === 'marquee') {
        const x0 = d.startClient.x - rect.left;
        const y0 = d.startClient.y - rect.top;
        schedule(() => setMarquee({
          x: Math.min(x0, sx),
          y: Math.min(y0, sy),
          w: Math.abs(sx - x0),
          h: Math.abs(sy - y0)
        }));
      }
    };

    const onUp = (e) => {
      const d = dragRef.current;
      if (!d.mode) return;
      flush();

      const rect = wrapRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const cur = vpRef.current;

      if (d.mode === 'pan') {
        // 只是点了一下空白（没有拖动）→ 取消选择
        if (!d.moved) {
          setSelection([]);
          setSelEdges([]);
        }
      } else if (d.mode === 'marquee') {
        // 框选：世界坐标矩形与节点求交
        const a = toWorld({ x: d.startClient.x - rect.left, y: d.startClient.y - rect.top }, cur);
        const b = toWorld({ x: sx, y: sy }, cur);
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
        const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        const hit = st.nodes
          .filter((n) => !(n.x + n.w < x1 || n.x > x2 || n.y + n.h < y1 || n.y > y2))
          .map((n) => n.id);
        setSelection(hit);
        setSelEdges([]);
        setMarquee(null);
      } else if (d.mode === 'link') {
        // 判断是否落在某个节点上
        const wpt = toWorld({ x: sx, y: sy }, cur);
        const target = st.nodes.find((n) =>
          wpt.x >= n.x && wpt.x <= n.x + n.w && wpt.y >= n.y && wpt.y <= n.y + n.h);
        if (target && target.id !== d.linkSourceId) {
          const edge = addEdge(d.linkSourceId, target.id);
          if (!edge) toast('无法连接：已存在、会形成环路或指向自身', 'warn');
        }
        setTempLink(null);
      } else if (d.moved) {
        commit(); // 移动/缩放结束才写入历史
      }

      dragRef.current = { mode: null };
      document.body.classList.remove('dragging');
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // 拖到窗口外松手时（收不到 mouseup）兜底复位，避免一直卡在拖拽态
    const onBlur = () => {
      if (dragRef.current.mode) {
        dragRef.current = { mode: null };
        setMarquee(null);
        setTempLink(null);
        document.body.classList.remove('dragging');
      }
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [st, toast]);

  /* ---------------- 键盘快捷键 ---------------- */
  useEffect(() => {
    const isInput = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    const onKeyDown = (e) => {
      if (e.code === 'Space' && !isInput(e.target)) {
        spaceRef.current = true;
        if (wrapRef.current) wrapRef.current.classList.add('grab');
        e.preventDefault();
      }
      if (isInput(e.target)) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) { redo() ? toast('已重做') : toast('没有可重做的操作'); }
        else { undo() ? toast('已撤销') : toast('没有可撤销的操作'); }
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault(); setSelection(st.nodes.map((n) => n.id));
      } else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault(); duplicate();
      } else if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault(); doExport();
      } else if (ctrl && e.key === '1') {
        e.preventDefault(); fit();
      } else if (e.key === 'h' || e.key === 'H') {
        setTool('hand');
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); doDelete();
      } else if (e.key === 'Escape') {
        setSelection([]); setSelEdges([]); setModal(null); setShowGallery(false);
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        if (wrapRef.current) wrapRef.current.classList.remove('grab');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line
  }, [selection, st]);

  /* ---------------- 交互回调 ---------------- */

  /** 背景按下：中键/右键/空格 → 平移；左键按当前工具决定「平移」还是「框选」 */
  const onBackgroundDown = (e) => {
    const cur = vpRef.current;

    // 中键 / 右键 / 空格：任何工具下都平移
    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      dragRef.current = {
        mode: 'pan',
        startScreen: { x: e.clientX, y: e.clientY },
        startVp: { x: cur.x, y: cur.y }
      };
      document.body.classList.add('dragging');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const rect = wrapRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const edge = hitTestEdge(pt, st.nodes, st.edges, cur);
    if (edge) {
      setSelEdges([edge.id]);
      setSelection([]);
      return;
    }

    /* 抓手工具（默认）：空白处左键拖拽 = 平移画布
     * 例外：按住 Shift 或切到「框选」工具时，才是框选 */
    const wantMarquee = tool === 'select' ? !e.shiftKey : (e.shiftKey || e.ctrlKey || e.metaKey);

    if (!wantMarquee) {
      // 先不取消选择：拖动=平移，单击（未移动）才取消选择
      dragRef.current = {
        mode: 'pan',
        startScreen: { x: e.clientX, y: e.clientY },
        startVp: { x: cur.x, y: cur.y },
        moved: false
      };
      document.body.classList.add('dragging');
      e.preventDefault();
      return;
    }

    // 框选
    setSelection([]);
    setSelEdges([]);
    dragRef.current = {
      mode: 'marquee',
      startClient: { x: e.clientX, y: e.clientY }
    };
  };

  /** 画布上常驻「抓手」按钮（触手）：拖它即可平移，不依赖整屏拖拽 */
  const onPanHandleDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const cur = vpRef.current;
    dragRef.current = {
      mode: 'pan',
      startScreen: { x: e.clientX, y: e.clientY },
      startVp: { x: cur.x, y: cur.y },
      moved: false
    };
    document.body.classList.add('dragging');
  };

  /** 节点按下：选中 + 准备拖动 */
  const onPointerDownCard = (e, node) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSelection((s) => (s.includes(node.id) ? s.filter((x) => x !== node.id) : s.concat(node.id)));
    } else if (!selection.includes(node.id)) {
      setSelection([node.id]);
    }
    setSelEdges([]);

    const ids = selection.includes(node.id) ? selection : [node.id];
    const start = {};
    ids.forEach((id) => {
      const n = getNode(id);
      if (n) start[id] = { x: n.x, y: n.y };
    });
    dragRef.current = {
      mode: 'move',
      startClient: { x: e.clientX, y: e.clientY },
      nodeStart: start,
      moved: false
    };
    document.body.classList.add('dragging');
  };

  const onResizeStart = (e, node) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      mode: 'resize',
      resizeId: node.id,
      startClient: { x: e.clientX, y: e.clientY },
      startSize: { w: node.w, h: node.h },
      moved: false
    };
    document.body.classList.add('dragging');
  };

  const onStartLink = (e, node) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    dragRef.current = {
      mode: 'link',
      linkSourceId: node.id
    };
    setTempLink({ sourceId: node.id, point: { x: e.clientX - rect.left, y: e.clientY - rect.top } });
    document.body.classList.add('dragging');
  };

  const onDataChange = useCallback((id, patch) => {
    updateNodeData(id, patch, true); // silent：输入过程中不写历史
  }, []);

  /* ---------------- 增删改 ---------------- */
  const addNodeAtCenter = (type) => {
    const cx = (-vp.x + size.width / 2) / vp.scale;
    const cy = (-vp.y + size.height / 2) / vp.scale;
    const n = addNode(type, cx - 150, cy - 100);
    setSelection([n.id]);
    toast(`已添加「${NODE_TYPES[type].name}」节点`);
  };

  const doDelete = () => {
    if (selEdges.length) { removeEdges(selEdges); setSelEdges([]); }
    if (selection.length) { removeNodes(selection); setSelection([]); }
  };

  const duplicate = () => {
    if (!selection.length) return;
    const map = {};
    const newIds = [];
    selection.forEach((id) => {
      const n = getNode(id);
      if (!n) return;
      const copy = addNode(n.type, n.x + 36, n.y + 36, JSON.parse(JSON.stringify(n.data)));
      copy.w = n.w; copy.h = n.h; copy.title = n.title;
      map[id] = copy.id;
      newIds.push(copy.id);
    });
    // 复制选中节点之间的连线
    st.edges.forEach((e) => {
      if (map[e.source] && map[e.target]) addEdge(map[e.source], map[e.target]);
    });
    setSelection(newIds);
    commit();
    toast(`已复制 ${newIds.length} 个节点`);
  };

  /* ---------------- 文件导入导出 ---------------- */
  const doExport = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thunder-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出 JSON');
  };

  const doImport = () => fileRef.current && fileRef.current.click();

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importJSON(String(reader.result));
        toast('导入成功');
        setSelection([]);
        setTimeout(fit, 50);
      } catch (err) {
        toast('导入失败：' + err.message, 'err');
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  /* ---------------- 视图操作 ---------------- */
  const zoomBy = (factor) => {
    setVp((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const cx = size.width / 2;
      const cy = size.height / 2;
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { scale: next, x: cx - wx * next, y: cy - wy * next };
    });
  };

  const zoomReset = () => {
    setVp((v) => {
      const cx = size.width / 2;
      const cy = size.height / 2;
      const wx = (cx - v.x) / v.scale;
      const wy = (cy - v.y) / v.scale;
      return { scale: 1, x: cx - wx, y: cy - wy };
    });
  };

  /** 适应视图：直接读 DOM 尺寸，避免依赖 size state 的时序问题 */
  const fitNow = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !stateNodes().length) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    stateNodes().forEach((n) => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
    });
    const pad = 80;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(W / w, H / h)));
    setVp({
      scale,
      x: W / 2 - (minX + (maxX - minX) / 2) * scale,
      y: H / 2 - (minY + (maxY - minY) / 2) * scale
    });
  }, []);

  const fit = fitNow;

  /** 供回调内部读取最新节点列表 */
  function stateNodes() { return state.nodes; }

  /** 把某节点居中（3D 画廊点击 / 属性面板定位用） */
  const focusNode = (id) => {
    const n = getNode(id);
    if (!n) return;
    setSelection([id]);
    setVp((v) => ({
      scale: v.scale,
      x: size.width / 2 - (n.x + n.w / 2) * v.scale,
      y: size.height / 2 - (n.y + n.h / 2) * v.scale
    }));
  };

  const jumpTo = (wx, wy) => {
    setVp((v) => ({ ...v, x: size.width / 2 - wx * v.scale, y: size.height / 2 - wy * v.scale }));
  };

  /* ---------------- 运行 ---------------- */
  /** 统一处理运行结果：区分「配置未完成」「有节点失败」「全部成功」 */
  const handleRunResult = (r) => {
    if (!r) return;
    if (r.blocked) {
      const first = (r.issues && r.issues[0] && r.issues[0].msg) || '请先配置渠道';
      toast('⚠ ' + first + '\n（已切到「渠道」页，填好 Base URL 与 API Key 再运行）', 'warn');
      setTab('channel');
      return;
    }
    if (r.err) {
      toast(`❌ ${r.err} 个节点失败，已切到「日志」查看具体原因`, 'err');
      setTab('log');
    } else if (r.ok) {
      toast(`✅ 全部完成，成功 ${r.ok} 个节点`, 'ok');
    }
  };

  const runAll = async () => {
    setRunning(true);
    setTab('log');
    try {
      const r = await Engine.run([]);
      handleRunResult(r);
    } catch (e) {
      toast('运行异常：' + String(e.message || e), 'err');
    } finally {
      setRunning(false);
    }
  };

  const runSelected = async () => {
    if (!selection.length) return;
    setRunning(true);
    setTab('log');
    try {
      const r = await Engine.run(selection);
      handleRunResult(r);
    } catch (e) {
      toast('运行异常：' + String(e.message || e), 'err');
    } finally {
      setRunning(false);
    }
  };
  const doStop = () => Engine.stop();

  /* ---------------- 渠道测试 / 拉模型 ---------------- */
  const onTestChannel = async (id) => {
    const ch = getChannel(id);
    if (!ch) return;
    toast('正在测试连接…');
    try {
      const r = await Api.test(ch);
      toast(`✅ 连接成功${r.count ? `，共 ${r.count} 个模型` : ''}`, 'ok');
    } catch (e) {
      toast('❌ ' + String(e.message || e).slice(0, 200), 'err');
    }
  };

  const onFetchModels = async (id) => {
    const ch = getChannel(id);
    if (!ch) return;
    toast('正在拉取模型列表…');
    try {
      const list = await Api.models(ch);
      ch.models = list;
      commit();
      toast(`已获取 ${list.length} 个模型`, 'ok');
    } catch (e) {
      toast('拉取失败：' + String(e.message || e).slice(0, 200), 'err');
    }
  };

  /* ---------------- 图片节点素材选择 ---------------- */
  const onOpenImagePicker = (nodeId) => setModal({ type: 'image', id: nodeId });

  /* ---------------- 正在运行 → 高亮其入边 ---------------- */
  const activeEdgeIds = st.edges
    .filter((e) => {
      const t = getNode(e.target);
      const s = getNode(e.source);
      return t && t.status === 'running' && s;
    })
    .map((e) => e.id);

  /* ---------------- 渲染 ---------------- */
  return (
    <div className="app">
      <Topbar
        scale={vp.scale}
        running={running}
        tool={tool}
        onTool={setTool}
        canUndo={canUndo()}
        canRedo={canRedo()}
        hasSelection={selection.length > 0}
        showGallery={showGallery}
        showMinimap={showMinimap}
        onNew={() => {
          if (confirm('确定清空当前画布吗？该操作不可撤销。')) {
            reset(); loadDemo(); setSelection([]); toast('已新建画布');
          }
        }}
        onImport={doImport}
        onExport={doExport}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onDuplicate={duplicate}
        onDelete={doDelete}
        onRunAll={runAll}
        onRunSelected={runSelected}
        onStop={doStop}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onZoomReset={zoomReset}
        onFit={fit}
        onToggleGallery={() => setShowGallery(!showGallery)}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
      />

      <div className="body">
        <Sidebar
          agents={st.agents}
          channels={st.channels}
          onAddNode={addNodeAtCenter}
          onEditAgent={(id) => setModal({ type: 'agent', id })}
          onEditChannel={(id) => setModal({ type: 'channel', id })}
          onSelectAgent={(id) => { setTab('agent'); }}
        />

        {/* ---------- 画布 ---------- */}
        <main
          className={`canvas-wrap tool-${tool}`}
          ref={wrapRef}
          onMouseDown={onBackgroundDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          <GridCanvas viewport={vp} size={size} />

          <EdgeCanvas
            nodes={st.nodes}
            edges={st.edges}
            viewport={vp}
            size={size}
            selectedEdgeIds={selEdges}
            activeEdgeIds={activeEdgeIds}
            tempLink={tempLink}
          />

          <div
            className="node-layer"
            style={{
              transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`,
              transformOrigin: '0 0'
            }}
          >
            {st.nodes.map((n) => (
              <NodeCard
                key={n.id}
                node={n}
                version={version}
                selected={selection.includes(n.id)}
                channels={st.channels}
                agents={st.agents}
                running={running}
                onPointerDownCard={onPointerDownCard}
                onStartLink={onStartLink}
                onResizeStart={onResizeStart}
                onDataChange={onDataChange}
                onOpenImagePicker={onOpenImagePicker}
                onOpenChannels={() => setTab('channel')}
              />
            ))}
          </div>

          {marquee && (
            <div
              className="marquee"
              style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
            />
          )}

          <Minimap
            nodes={st.nodes}
            viewport={vp}
            size={{ width: 220, height: 150 }}
            visible={showMinimap}
            onJump={jumpTo}
          />

          <button
            className="pan-handle"
            onMouseDown={onPanHandleDown}
            title="抓手（触手）：拖我平移画布（任何工具下都能用）"
          >✋</button>

          <div className="canvas-hud">
            <span>{st.nodes.length} 节点 · {st.edges.length} 连线</span>
            <span>缩放 {Math.round(vp.scale * 100)}%</span>
            <span className="hud-tip">
              {tool === 'hand'
                ? '✋ 拖空白平移 · Shift+拖 框选 · H 切换'
                : '⬚ 拖空白框选 · 空格/中键 平移 · V 切换'}
            </span>
          </div>
        </main>

        <Inspector
          tab={tab}
          setTab={setTab}
          selection={selection}
          agents={st.agents}
          channels={st.channels}
          onEditAgent={(id) => setModal({ type: 'agent', id })}
          onEditChannel={(id) => setModal({ type: 'channel', id })}
          onRemoveAgent={(id) => { removeAgentById(id); }}
          onRemoveChannel={(id) => { removeChannelById(id); }}
          onTestChannel={onTestChannel}
          onFetchModels={onFetchModels}
          onFocusNode={focusNode}
        />
      </div>

      <footer className="statusbar">
        <span>{running ? '执行中…' : '就绪'}</span>
        <span className="sb-spacer" />
        <span>数据保存在浏览器本地 · 自动保存</span>
      </footer>

      {/* ---------- 弹窗 ---------- */}
      {modal && modal.type === 'channel' && (
        <ChannelModal
          channel={modal.id ? getChannel(modal.id) : null}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'agent' && (
        <AgentModal
          agent={modal.id ? st.agents.find((a) => a.id === modal.id) : null}
          channels={st.channels}
          onClose={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'image' && (
        <ImagePickerModal
          nodeId={modal.id}
          onClose={() => setModal(null)}
          onPick={(url) => { updateNodeData(modal.id, { src: url }); commit(); setModal(null); }}
        />
      )}

      {showGallery && (
        <Gallery3D
          nodes={st.nodes}
          onClose={() => setShowGallery(false)}
          onLocate={(id) => { focusNode(id); setShowGallery(false); }}
        />
      )}

      <Toasts items={toasts} onRemove={removeToast} />

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={onFile}
      />
    </div>
  );
}

/* ----------------------------------------------------------
 * 删除 Agent / Channel 的包装（带二次确认）
 * ---------------------------------------------------------- */
function removeAgentById(id) {
  if (confirm('删除该 Agent？画布上引用它的节点会自动移除引用。')) removeAgent(id);
}
function removeChannelById(id) {
  if (confirm('删除该渠道？绑定它的 Agent 与节点会变为未绑定。')) removeChannel(id);
}

/* ----------------------------------------------------------
 * 图片素材选择弹窗
 * ---------------------------------------------------------- */
function ImagePickerModal({ nodeId, onClose, onPick }) {
  const [url, setUrl] = useState('');
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 460 }}>
        <div className="modal-head">
          <span>设置图片</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>本地文件（转为 base64 存入画布）</label>
            <input
              className="inp"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => onPick(String(r.result));
                r.readAsDataURL(f);
              }}
            />
          </div>
          <div className="field">
            <label>或填写图片 URL</label>
            <input
              className="inp"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!url.trim()} onClick={() => onPick(url.trim())}>
            使用该 URL
          </button>
        </div>
      </div>
    </div>
  );
}
