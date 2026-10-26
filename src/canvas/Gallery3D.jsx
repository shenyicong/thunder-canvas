/* ==========================================================
 * Gallery3D.jsx —— Three.js 3D 画廊视图
 * ----------------------------------------------------------
 * 用途：把画布上产出的图片 / 视频放进 3D 空间立体浏览，
 *       适合方案评审与成果展示（节点多时比 2D 平铺更直观）。
 * 技术：Three.js Scene + PerspectiveCamera + OrbitControls，
 *       贴图用 CanvasTexture 兜底，避免跨域图片加载失败导致空白。
 * ========================================================== */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** 收集画布里所有可展示的媒体素材 */
export function collectMedia(nodes) {
  const items = [];
  nodes.forEach((n) => {
    const d = n.data || {};
    if (n.type === 'imagegen' && Array.isArray(d.images)) {
      d.images.forEach((u, i) => items.push({ url: u, title: `${n.title} #${i + 1}`, kind: 'image', nodeId: n.id }));
    } else if (n.type === 'image' && d.src) {
      items.push({ url: d.src, title: d.caption || n.title, kind: 'image', nodeId: n.id });
    } else if (n.type === 'videogen' && d.videoUrl) {
      items.push({ url: d.videoUrl, title: n.title, kind: 'video', nodeId: n.id });
    }
  });
  return items;
}

/** 生成标题贴图（用 Canvas 画文字，避免引入字体加载器） */
function makeLabelTexture(text, color = '#7c5cff') {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(14,17,22,0.92)';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 96);
  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textBaseline = 'middle';
  const maxW = 470;
  let s = text || '未命名';
  while (ctx.measureText(s).width > maxW && s.length > 2) s = s.slice(0, -2);
  if (s !== text) s += '…';
  ctx.fillText(s, 24, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

/** 兜底占位贴图（图片加载失败时使用） */
function makePlaceholderTexture(label) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#1c222b');
  g.addColorStop(1, '#2a3444');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#3a4553';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 496);
  ctx.fillStyle = '#9aa7b5';
  ctx.font = '28px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label || '素材', 256, 240);
  ctx.fillStyle = '#647081';
  ctx.font = '20px "PingFang SC",sans-serif';
  ctx.fillText('（图片无法加载，可能是跨域限制）', 256, 286);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

export default function Gallery3D({ nodes, onClose, onLocate }) {
  const mountRef = useRef(null);
  const [layout, setLayout] = useState('ring');
  const [count, setCount] = useState(0);
  const threeRef = useRef({});

  /* ---------- 初始化场景 ---------- */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0e13');
    scene.fog = new THREE.Fog('#0b0e13', 18, 60);

    const camera = new THREE.PerspectiveCamera(
      55, mount.clientWidth / mount.clientHeight, 0.1, 500
    );
    camera.position.set(0, 2.2, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 60;

    // 灯光
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(5, 10, 8);
    scene.add(dir);

    // 地面网格
    const grid = new THREE.GridHelper(80, 80, 0x2c3541, 0x1a2029);
    grid.position.y = -2.4;
    scene.add(grid);

    const group = new THREE.Group();
    scene.add(group);

    threeRef.current = { scene, camera, renderer, controls, group, raf: 0 };

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      threeRef.current.raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(threeRef.current.raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      // 释放几何体与贴图
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    };
  }, []);

  /* ---------- 依据素材与布局重建展板 ---------- */
  useEffect(() => {
    const t = threeRef.current;
    if (!t.group) return;

    // 清理旧展板
    while (t.group.children.length) {
      const c = t.group.children.pop();
      t.group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    }

    const items = collectMedia(nodes);
    setCount(items.length);
    if (!items.length) return;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const R = layout === 'ring' ? Math.max(6, items.length * 1.35) : 0;
    const COLS = Math.ceil(Math.sqrt(items.length));

    items.forEach((item, i) => {
      // 展板：先放占位贴图，图片加载成功后再替换
      const w = 3.2;
      const h = 3.2;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        map: makePlaceholderTexture(item.title),
        side: THREE.DoubleSide,
        transparent: true
      });
      const mesh = new THREE.Mesh(geo, mat);

      // 位置
      if (layout === 'ring') {
        const angle = (i / items.length) * Math.PI * 2;
        mesh.position.set(Math.sin(angle) * R, 0.4, Math.cos(angle) * R);
        mesh.rotation.y = angle; // 面向圆心外侧
      } else {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        mesh.position.set((col - (COLS - 1) / 2) * 3.8, 0.4 + (row % 2) * 0.01, -row * 0.05);
      }

      // 边框
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + 0.08, h + 0.08)),
        new THREE.LineBasicMaterial({ color: 0x3a4553 })
      );
      frame.position.copy(mesh.position);
      frame.rotation.copy(mesh.rotation);
      frame.position.z -= 0.01;
      t.group.add(frame);

      // 标题牌
      const labelMat = new THREE.MeshBasicMaterial({
        map: makeLabelTexture(item.title, item.kind === 'video' ? '#ff7b4c' : '#7c5cff'),
        transparent: true, side: THREE.DoubleSide
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.56), labelMat);
      label.position.set(mesh.position.x, mesh.position.y - h / 2 - 0.42, mesh.position.z);
      label.rotation.copy(mesh.rotation);
      t.group.add(label);

      t.group.add(mesh);

      // 异步加载真实贴图（跨域失败则保留占位图）
      if (item.kind === 'image') {
        loader.load(
          item.url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            // 按图片宽高比自适应展板
            const img = tex.image;
            const ratio = (img && img.width && img.height) ? img.width / img.height : 1;
            mesh.geometry.dispose();
            mesh.geometry = new THREE.PlaneGeometry(
              ratio >= 1 ? 3.2 : 3.2 * ratio,
              ratio >= 1 ? 3.2 / ratio : 3.2
            );
            mat.map = tex;
            mat.needsUpdate = true;
          },
          undefined,
          () => { /* 加载失败：保留占位贴图 */ }
        );
      }

      // 点击展板 → 回到 2D 画布并定位到该节点
      mesh.userData.nodeId = item.nodeId;
    });

    // 相机复位
    t.camera.position.set(0, 2.2, layout === 'ring' ? R + 6 : 14);
    t.controls.target.set(0, 0, 0);
    t.controls.update();
  }, [nodes, layout]);

  /* ---------- 点击拾取 ---------- */
  useEffect(() => {
    const t = threeRef.current;
    if (!t.renderer) return undefined;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (ev) => {
      const rect = t.renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, t.camera);
      const hits = raycaster.intersectObjects(t.group.children, false);
      const hit = hits.find((h) => h.object.userData.nodeId);
      if (hit && onLocate) onLocate(hit.object.userData.nodeId);
    };
    t.renderer.domElement.addEventListener('click', onClick);
    return () => {
      if (t.renderer) t.renderer.domElement.removeEventListener('click', onClick);
    };
  }, [onLocate]);

  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal gallery-modal">
        <div className="modal-head">
          <span>🌀 3D 画廊（Three.js）</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="gallery-toolbar">
          <span className="gt-info">共 {count} 个素材</span>
          <span className="sb-spacer" />
          <button
            className={'btn' + (layout === 'ring' ? ' active' : '')}
            onClick={() => setLayout('ring')}
          >环形</button>
          <button
            className={'btn' + (layout === 'wall' ? ' active' : '')}
            onClick={() => setLayout('wall')}
          >画廊墙</button>
        </div>
        <div className="gallery-mount" ref={mountRef} />
        <div className="gallery-tip">
          拖拽旋转 · 滚轮缩放 · 右键平移 · 点击展板可回到画布并定位该节点
        </div>
      </div>
    </div>
  );
}
