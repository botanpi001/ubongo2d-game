/* ウボンゴ2D（テトロミノ＋ペントミノ）
   - 最大8x8盤
   - 接するシルエットのみ（各ピースは必ず辺で接する配置で生成）
   - 解あり問題のみ（解＝生成時の配置）
   - 全50問（かんたん18／ふつう16／むずかしい16）
   - ダブルタップ（ダブルクリック）で右回転
   - ドラッグ＆タッチ／スナップ補助
*/

(() => {
  // ====== DOM ======
  const boardSVG = document.getElementById('board');
  const trayEl = document.getElementById('tray');
  const statusEl = document.getElementById('status');
  const puzzleLabel = document.getElementById('puzzleLabel');
  const difficultySel = document.getElementById('difficulty');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const resetBtn = document.getElementById('resetBtn');
  const exportBtn = document.getElementById('exportBtn');

  // ====== 基本設定 ======
  const CELL = 32;
  const GRID_MARGIN = 16;
  const BOARD_W = 8;
  const BOARD_H = 8;

  // 問題割り当て
  const TOTAL = 50;
  const N_EASY = 18, N_MED = 16, N_HARD = 16;

  // 難易度に応じた使用ピース数
  const DIFF_DEF = {
    easy:   { piecesMin: 2, piecesMax: 3 },
    medium: { piecesMin: 3, piecesMax: 4 },
    hard:   { piecesMin: 4, piecesMax: 5 },
  };

  // 乱数（シード）
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5;  s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }
  const RAND = rng(0xA5B7C9);

  // ====== ピース定義（基本形）======
  // テトロミノ（7種）
  const TETROMINO = {
    I: [[0,0],[1,0],[2,0],[3,0]],
    O: [[0,0],[1,0],[0,1],[1,1]],
    T: [[0,0],[1,0],[2,0],[1,1]],
    S: [[1,0],[2,0],[0,1],[1,1]],
    Z: [[0,0],[1,0],[1,1],[2,1]],
    J: [[0,0],[0,1],[0,2],[1,2]],
    L: [[1,0],[1,1],[1,2],[0,2]],
  };
  // ペントミノ（12種）
  const PENTOMINO = {
    F: [[0,1],[1,0],[1,1],[1,2],[2,2]],
    I: [[0,0],[1,0],[2,0],[3,0],[4,0]],
    L: [[0,0],[0,1],[0,2],[0,3],[1,3]],
    N: [[0,0],[1,0],[1,1],[2,1],[3,1]],
    P: [[0,0],[1,0],[0,1],[1,1],[0,2]],
    T: [[0,0],[1,0],[2,0],[1,1],[1,2]],
    U: [[0,0],[0,1],[1,1],[2,1],[2,0]],
    V: [[0,0],[0,1],[0,2],[1,2],[2,2]],
    W: [[0,0],[1,0],[1,1],[2,1],[2,2]],
    X: [[1,0],[0,1],[1,1],[2,1],[1,2]],
    Y: [[0,0],[1,0],[2,0],[3,0],[2,1]],
    Z: [[0,0],[1,0],[1,1],[2,1],[2,2]],
  };

  const ALL_PIECES = Object.entries(TETROMINO).map(([k,v])=>({id:`T-${k}`, cells:v}))
                      .concat(Object.entries(PENTOMINO).map(([k,v])=>({id:`P-${k}`, cells:v})));

  // ====== ユーティリティ ======
  function rotateCells(cells, times) {
    let pts = cells.map(([x,y]) => [x,y]);
    for (let r=0;r<times;r++){
      pts = pts.map(([x,y]) => [y, -x]);
      // 左上に寄せる
      const minx = Math.min(...pts.map(p=>p[0]));
      const miny = Math.min(...pts.map(p=>p[1]));
      pts = pts.map(([x,y]) => [x-minx, y-miny]);
    }
    return pts;
  }
  function aabb(cells){
    const xs = cells.map(c=>c[0]), ys = cells.map(c=>c[1]);
    return { w: Math.max(...xs)+1, h: Math.max(...ys)+1 };
  }
  function neighbors4([x,y]){ return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]; }

  // ====== 接するシルエットの問題生成（解あり）======
  function generateOnePuzzle(diffKey){
    const diff = DIFF_DEF[diffKey];
    const pickCount = Math.floor(RAND()*(diff.piecesMax - diff.piecesMin + 1)) + diff.piecesMin;

    // ランダムにピース選択（重複はOKにすると簡単になるので、ここでは「重複なし」に）
    const pool = ALL_PIECES.slice().sort(()=>RAND()-0.5);
    const chosen = pool.slice(0, pickCount);

    const occupied = new Set();
    const placed = [];

    // 1個目は盤面中心付近に
    {
      const p = chosen[0];
      const rot = Math.floor(RAND()*4);
      const cells = rotateCells(p.cells, rot);
      const {w,h} = aabb(cells);
      const px = Math.max(0, Math.min(BOARD_W - w, Math.floor(BOARD_W/2 - w/2)));
      const py = Math.max(0, Math.min(BOARD_H - h, Math.floor(BOARD_H/2 - h/2)));
      for (const [cx,cy] of cells) occupied.add(`${px+cx},${py+cy}`);
      placed.push({id:p.id, rot, x:px, y:py, cells});
    }

    // 2個目以降：既存occupiedに必ず辺接触する位置に置く
    for (let i=1; i<chosen.length; i++){
      const p = chosen[i];
      let placedOK = false;

      // 置けるポジションを探索
      const rotOrder = [0,1,2,3].sort(()=>RAND()-0.5);
      outer:
      for (const rot of rotOrder){
        const cells = rotateCells(p.cells, rot);
        const {w,h} = aabb(cells);

        // 盤内の全位置をランダム順で試す
        const xs = [...Array(BOARD_W - w + 1).keys()].sort(()=>RAND()-0.5);
        const ys = [...Array(BOARD_H - h + 1).keys()].sort(()=>RAND()-0.5);

        for (const px of xs){
          for (const py of ys){
            let overlap = false;
            let touching = false;
            for (const [cx,cy] of cells){
              const gx = px+cx, gy = py+cy;
              const key = `${gx},${gy}`;
              if (occupied.has(key)){ overlap = true; break; }
              // 辺接触チェック
              for (const [nx,ny] of neighbors4([gx,gy])){
                if (occupied.has(`${nx},${ny}`)){ touching = true; break; }
              }
            }
            if (!overlap && touching){
              // 置けた
              for (const [cx,cy] of cells) occupied.add(`${px+cx},${py+cy}`);
              placed.push({id:p.id, rot, x:px, y:py, cells});
              placedOK = true;
              break outer;
            }
          }
        }
      }
      if (!placedOK) return null; // 作れなかったら失敗
    }

    // ターゲットマスク
    const target = [...occupied].map(k=>k.split(',').map(Number));
    return {
      difficulty: diffKey,
      boardW: BOARD_W, boardH: BOARD_H,
      pieces: placed.map(p=>({ id:p.id })),
      solution: placed,
      targetMask: target
    };
  }

  function generateAllPuzzles(){
    const all = [];
    // かんたん18
    while (all.filter(p=>p && p.difficulty==='easy').length < N_EASY){
      const p = generateOnePuzzle('easy'); if (p) all.push(p);
    }
    // ふつう16
    while (all.filter(p=>p && p.difficulty==='medium').length < N_MED){
      const p = generateOnePuzzle('medium'); if (p) all.push(p);
    }
    // むずかしい16
    while (all.filter(p=>p && p.difficulty==='hard').length < N_HARD){
      const p = generateOnePuzzle('hard'); if (p) all.push(p);
    }
    // シャッフル
    all.sort(()=>RAND()-0.5);
    return all.slice(0, TOTAL);
  }

  // 生成（接する・解あり）
  const ALL_PUZZLES = generateAllPuzzles();

  // ====== 盤面描画 ======
  function clearSVG(svg){ while (svg.firstChild) svg.removeChild(svg.firstChild); }

  function drawBoardGrid(svg, cols, rows){
    const width = cols*CELL + GRID_MARGIN*2;
    const height = rows*CELL + GRID_MARGIN*2;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', width); bg.setAttribute('height', height);
    bg.setAttribute('fill', 'transparent');
    svg.appendChild(bg);

    for (let c=0;c<=cols;c++){
      const x = GRID_MARGIN + c*CELL;
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', x); line.setAttribute('y1', GRID_MARGIN);
      line.setAttribute('x2', x); line.setAttribute('y2', GRID_MARGIN + rows*CELL);
      line.setAttribute('class','grid-line');
      svg.appendChild(line);
    }
    for (let r=0;r<=rows;r++){
      const y = GRID_MARGIN + r*CELL;
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', GRID_MARGIN); line.setAttribute('y1', y);
      line.setAttribute('x2', GRID_MARGIN + cols*CELL); line.setAttribute('y2', y);
      line.setAttribute('class','grid-line');
      svg.appendChild(line);
    }
  }

  function drawTargetMask(svg, mask){
    for (const [gx,gy] of mask){
      const cell = document.createElementNS('http://www.w3.org/2000/svg','rect');
      cell.setAttribute('x', GRID_MARGIN + gx*CELL);
      cell.setAttribute('y', GRID_MARGIN + gy*CELL);
      cell.setAttribute('width', CELL);
      cell.setAttribute('height', CELL);
      cell.setAttribute('class','target-cell');
      svg.appendChild(cell);
    }
  }

  // ====== ピースUI ======
  let currentPuzzle = null;
  let drag = null;

  function getDefById(id){
    const typ = id.startsWith('T-') ? TETROMINO : PENTOMINO;
    return typ[id.split('-')[1]];
  }

  function getCellsOfPiece(g){
    const id = g.getAttribute('data-id');
    const rot = parseInt(g.getAttribute('data-rot')||'0',10);
    return rotateCells(getDefById(id), rot);
  }

  function bboxOfCells(cells){
    const xs = cells.map(c=>c[0]), ys = cells.map(c=>c[1]);
    return { minx:Math.min(...xs), miny:Math.min(...ys), maxx:Math.max(...xs), maxy:Math.max(...ys) };
  }

  function getTopLeftOfPiece(g){
    const rects = [...g.querySelectorAll('.piece-cell')];
    let gx = Infinity, gy = Infinity;
    rects.forEach(r=>{
      const x = Math.round((parseFloat(r.getAttribute('x')) - GRID_MARGIN)/CELL);
      const y = Math.round((parseFloat(r.getAttribute('y')) - GRID_MARGIN)/CELL);
      gx = Math.min(gx, x);
      gy = Math.min(gy, y);
    });
    return {x:gx, y:gy};
  }

  function setPieceTopLeft(g, gx, gy){
    const cells = getCellsOfPiece(g);
    const rects = [...g.querySelectorAll('.piece-cell')];
    rects.forEach((r,idx)=>{
      const [cx,cy] = cells[idx];
      r.setAttribute('x', GRID_MARGIN + (gx+cx)*CELL);
      r.setAttribute('y', GRID_MARGIN + (gy+cy)*CELL);
    });
    // カバー更新
    const bb = bboxOfCells(cells);
    const cover = g.querySelector('rect[fill="transparent"]');
    if (cover){
      cover.setAttribute('x', GRID_MARGIN + (gx+bb.minx)*CELL);
      cover.setAttribute('y', GRID_MARGIN + (gy+bb.miny)*CELL);
      cover.setAttribute('width', (bb.maxx-bb.minx+1)*CELL);
      cover.setAttribute('height', (bb.maxy-bb.miny+1)*CELL);
    }
  }

  function rotatePiece(g){
    const rot = (parseInt(g.getAttribute('data-rot')||'0',10) + 1) % 4;
    g.setAttribute('data-rot', String(rot));
    const tl = getTopLeftOfPiece(g);
    const id = g.getAttribute('data-id');
    const cells = rotateCells(getDefById(id), rot);
    const rects = [...g.querySelectorAll('.piece-cell')];
    rects.forEach((r,idx)=>{
      const [cx,cy] = cells[idx];
      r.setAttribute('x', GRID_MARGIN + (tl.x+cx)*CELL);
      r.setAttribute('y', GRID_MARGIN + (tl.y+cy)*CELL);
    });
    // カバー更新
    const bb = bboxOfCells(cells);
    const cover = g.querySelector('rect[fill="transparent"]');
    if (cover){
      cover.setAttribute('x', GRID_MARGIN + (tl.x+bb.minx)*CELL);
      cover.setAttribute('y', GRID_MARGIN + (tl.y+bb.miny)*CELL);
      cover.setAttribute('width', (bb.maxx-bb.minx+1)*CELL);
      cover.setAttribute('height', (bb.maxy-bb.miny+1)*CELL);
    }
    // 配置判定更新
    const ok = validatePlacement(g);
    g.classList.toggle('piece-good', ok);
    g.classList.toggle('piece-bad', !ok);
    checkClear();
  }

  // ダブルタップ／ダブルクリック検出
  const dblState = { time:0, x:0, y:0, target:null };
  function isDoubleTap(ev, thresholdMs=300, movePx=10){
    const now = performance.now();
    const cx = ev.clientX, cy = ev.clientY;
    const prev = dblState;
    const ok = (now - prev.time) < thresholdMs &&
               prev.target === ev.currentTarget &&
               Math.hypot(cx - prev.x, cy - prev.y) < movePx;
    dblState.time = now; dblState.x = cx; dblState.y = cy; dblState.target = ev.currentTarget;
    return ok;
  }

  function makePieceGroup(svg, pieceId, startX, startY, startRot=0){
    const base = getDefById(pieceId);
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('data-id', pieceId);
    g.setAttribute('data-rot', String(startRot));
    g.setAttribute('tabindex', '0');

    // セル描画
    const cells = rotateCells(base, startRot);
    for (const [cx,cy] of cells){
      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', GRID_MARGIN + (startX+cx)*CELL);
      rect.setAttribute('y', GRID_MARGIN + (startY+cy)*CELL);
      rect.setAttribute('width', CELL);
      rect.setAttribute('height', CELL);
      rect.setAttribute('class', 'piece-cell');
      g.appendChild(rect);
    }
    g.classList.add('piece-shadow');

    // 透明カバー（ドラッグ掴みやすく）
    const bb = bboxOfCells(cells);
    const cover = document.createElementNS('http://www.w3.org/2000/svg','rect');
    cover.setAttribute('x', GRID_MARGIN + (startX+bb.minx)*CELL);
    cover.setAttribute('y', GRID_MARGIN + (startY+bb.miny)*CELL);
    cover.setAttribute('width', (bb.maxx-bb.minx+1)*CELL);
    cover.setAttribute('height', (bb.maxy-bb.miny+1)*CELL);
    cover.setAttribute('fill', 'transparent');
    cover.style.cursor = 'grab';
    g.appendChild(cover);

    // ドラッグ（Pointer Events）
    g.addEventListener('pointerdown', (ev)=>{
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);

      // ダブルタップ／クリックで回転
      if (isDoubleTap(ev)) {
        rotatePiece(g);
        return;
      }

      const {x,y} = svgPoint(boardSVG, ev.clientX, ev.clientY);
      drag = {
        target: g,
        startMouse: {x,y},
        startGrid: getTopLeftOfPiece(g),
      };
      cover.style.cursor = 'grabbing';
    });

    g.addEventListener('pointermove', (ev)=>{
      if (!drag || drag.target!==g) return;
      const {x,y} = svgPoint(boardSVG, ev.clientX, ev.clientY);
      const dx = x - drag.startMouse.x;
      const dy = y - drag.startMouse.y;
      const ddx = Math.round(dx / CELL);
      const ddy = Math.round(dy / CELL);
      const nx = drag.startGrid.x + ddx;
      const ny = drag.startGrid.y + ddy;
      setPieceTopLeft(g, nx, ny);
    });

    g.addEventListener('pointerup', (ev)=>{
      if (!drag || drag.target!==g) return;
      const ok = validatePlacement(g);
      g.classList.toggle('piece-good', ok);
      g.classList.toggle('piece-bad', !ok);
      drag.target.releasePointerCapture(ev.pointerId);
      const coverEl = g.querySelector('rect[fill="transparent"]');
      if (coverEl) coverEl.style.cursor = 'grab';
      drag = null;
      checkClear();
    });

    // マウスのダブルクリックにも対応（PC向け）
    g.addEventListener('dblclick', (ev)=>{ ev.preventDefault(); rotatePiece(g); });

    svg.appendChild(g);
    return g;
  }

  function svgPoint(svg, clientX, clientY){
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  }

  // ====== 判定 ======
  function validatePlacement(g){
    if (!currentPuzzle) return false;
    const cols = currentPuzzle.boardW;
    const rows = currentPuzzle.boardH;

    const tl = getTopLeftOfPiece(g);
    const cells = getCellsOfPiece(g);
    const occupy = cells.map(([cx,cy]) => [tl.x+cx, tl.y+cy]);

    // 盤内
    for (const [gx,gy] of occupy){
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    }
    // ターゲット形状内
    const mask = currentPuzzle.targetSet;
    for (const [gx,gy] of occupy){
      if (!mask.has(`${gx},${gy}`)) return false;
    }
    // 他ピースとの重なりなし
    const others = [...boardSVG.querySelectorAll('g[data-id]')].filter(el=>el!==g);
    const used = new Set();
    for (const og of others){
      const otl = getTopLeftOfPiece(og);
      const ocells = getCellsOfPiece(og);
      for (const [cx,cy] of ocells) used.add(`${otl.x+cx},${otl.y+cy}`);
    }
    for (const [gx,gy] of occupy){
      if (used.has(`${gx},${gy}`)) return false;
    }
    return true;
  }

  function checkClear(){
    if (!currentPuzzle) return;
    const mask = currentPuzzle.targetSet;
    const filled = new Set();
    const pieces = [...boardSVG.querySelectorAll('g[data-id]')];

    for (const g of pieces){
      if (!validatePlacement(g)) { setStatus("まだだよ。ターゲットの形にピッタリ置いてね。","ng"); return; }
      const tl = getTopLeftOfPiece(g);
      const cells = getCellsOfPiece(g);
      for (const [cx,cy] of cells) filled.add(`${tl.x+cx},${tl.y+cy}`);
    }

    let ok = true;
    for (const key of mask){ if (!filled.has(key)){ ok=false; break; } }
    if (ok) setStatus("クリア！おめでとう！🎉","ok");
    else setStatus("もう少し！全部のマスを埋めよう。","ng");
  }

  function setStatus(msg, cls){
    statusEl.textContent = msg;
    statusEl.className = "status " + (cls||"");
  }

  // ====== ロード／UI ======
  let filtered = ALL_PUZZLES.slice();
  let idx = 0;

  function filterByDifficulty(){
    const sel = difficultySel.value;
    if (sel==='all') filtered = ALL_PUZZLES.slice();
    else filtered = ALL_PUZZLES.filter(p=>p.difficulty===sel);
    idx = 0;
    loadPuzzle();
  }

  function renderTray(pz){
    trayEl.innerHTML = "";
    for (const piece of pz.pieces){
      const card = document.createElement('div');
      card.className = 'piece-card';

      const head = document.createElement('div');
      head.className = 'piece-head';
      const nm = document.createElement('div');
      nm.className = 'piece-name';
      nm.textContent = `ピース：${piece.id}`;
      const actions = document.createElement('div');
      actions.className = 'piece-actions';

      const rotateBtn = document.createElement('button');
      rotateBtn.textContent = '右回転（90°）';
      rotateBtn.addEventListener('click', ()=>{
        const g = [...boardSVG.querySelectorAll(`g[data-id="${piece.id}"]`)].at(-1);
        if (g) rotatePiece(g);
      });
      actions.appendChild(rotateBtn);

      head.appendChild(nm);
      head.appendChild(actions);

      const canvas = document.createElement('div');
      canvas.className = 'piece-canvas';
      canvas.innerHTML = `<svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"></svg>`;
      drawMini(canvas.querySelector('svg'), piece.id);
      card.appendChild(head);
      card.appendChild(canvas);

      trayEl.appendChild(card);
    }
  }

  function drawMini(svg, pieceId){
    const base = getDefById(pieceId);
    const cells = rotateCells(base, 0);
    const xs = cells.map(c=>c[0]), ys = cells.map(c=>c[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs);
    const miny = Math.min(...ys), maxy = Math.max(...ys);
    const w = (maxx - minx + 1), h = (maxy - miny + 1);
    const s = Math.floor(Math.min(100 / Math.max(w,h), 28));
    const pad = 10;
    svg.setAttribute('viewBox', `0 0 ${w*s + pad*2} ${h*s + pad*2}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    cells.forEach(([x,y])=>{
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', pad + (x-minx)*s);
      r.setAttribute('y', pad + (y-miny)*s);
      r.setAttribute('width', s);
      r.setAttribute('height', s);
      r.setAttribute('rx', 4); r.setAttribute('ry', 4);
      r.setAttribute('class','piece-cell');
      svg.appendChild(r);
    });
  }

  // 現在パズルの初期配置を作る（ターゲットとは離す）
  function randomStartPos(idxOrder){
    // 画面上で見やすいよう、上段／下段に並べる
    const laneY = [0, BOARD_H - 3, 2, BOARD_H - 5];
    const laneXStart = [0, 2, 4, 1];
    return {
      x: (laneXStart[idxOrder % laneXStart.length] + (idxOrder*2)) % Math.max(1, BOARD_W-3),
      y: laneY[idxOrder % laneY.length]
    };
  }

  function loadPuzzle(){
    const pz = filtered[idx];
    currentPuzzle = null; // ローディング中は無効化
    setStatus("ピースを動かして、ターゲットの形をピッタリ埋めてね。","");

    clearSVG(boardSVG);
    drawBoardGrid(boardSVG, BOARD_W, BOARD_H);
    drawTargetMask(boardSVG, pz.targetMask);

    // 参照用セット
    pz.targetSet = new Set(pz.targetMask.map(([x,y])=>`${x},${y}`));
    currentPuzzle = pz;

    // 盤面にピースを生成（初期位置はターゲットから離す）
    pz._spawned = [];
    pz.pieces.forEach((pc, i)=>{
      const rot = Math.floor(RAND()*4);
      const start = randomStartPos(i);
      const g = makePieceGroup(boardSVG, pc.id, start.x, start.y, rot);
      // 置き直しやすいように最初は未配置扱い（赤）
      const ok = validatePlacement(g);
      g.classList.toggle('piece-good', ok);
      g.classList.toggle('piece-bad', !ok);
      pz._spawned.push({id: pc.id, rot, x:start.x, y:start.y});
    });

    renderTray(pz);

    const total = filtered.length;
    puzzleLabel.textContent = `問題 ${idx+1} / ${total}（${pz.difficulty}）`;
  }

  function resetPuzzle(){
    if (!currentPuzzle) return;
    // 一旦全ピース削除
    [...boardSVG.querySelectorAll('g[data-id]')].forEach(el=>el.remove());
    // 新しい初期位置で作り直し
    currentPuzzle.pieces.forEach((pc, i)=>{
      const rot = Math.floor(RAND()*4);
      const start = randomStartPos(i + Math.floor(RAND()*3));
      const g = makePieceGroup(boardSVG, pc.id, start.x, start.y, rot);
      const ok = validatePlacement(g);
      g.classList.toggle('piece-good', ok);
      g.classList.toggle('piece-bad', !ok);
    });
    setStatus("リセットしたよ。もう一度チャレンジ！","")
  }

  // 進む・戻る
  prevBtn.addEventListener('click', ()=>{
    if (filtered.length===0) return;
    idx = (idx - 1 + filtered.length) % filtered.length;
    loadPuzzle();
  });
  nextBtn.addEventListener('click', ()=>{
    if (filtered.length===0) return;
    idx = (idx + 1) % filtered.length;
    loadPuzzle();
  });
  resetBtn.addEventListener('click', resetPuzzle);
  difficultySel.addEventListener('change', filterByDifficulty);

  // JSON書き出し（盤面マスク＋使用ピース＋難易度）
  exportBtn.addEventListener('click', ()=>{
    const out = {
      meta: {
        name: "Ubongo-like 2D (Tetromino & Pentomino)",
        boardSize: [BOARD_W, BOARD_H],
        total: ALL_PUZZLES.length,
        note: "全て接するシルエット／解答あり／自動生成",
      },
      pieces: {
        tetromino: TETROMINO,
        pentomino: PENTOMINO
      },
      puzzles: ALL_PUZZLES.map((p, i)=>({
        id: i+1,
        difficulty: p.difficulty,
        boardW: p.boardW,
        boardH: p.boardH,
        targetMask: p.targetMask,
        pieces: p.pieces.map(pc=>pc.id)
      }))
    };
    const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ubongo_tetro_pento_50.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // 初期ロード
  filterByDifficulty(); // まず全問題でロード
})();
