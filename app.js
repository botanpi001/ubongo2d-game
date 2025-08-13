/* ウボンゴ2D  —  HTML/SVGドラッグ＆タッチ対応版
   ポイント：
   - 30問を確実に「解のある形」から生成（＝表示される問題は必ず解けます）
   - かんたん／ふつう／むずかしい の難易度で盤面サイズとピース数を調整
   - ドラッグ＆ドロップ／タッチ（Pointer Events）対応
   - 盤面スナップ（キレイにはまる補助）
   - 回転ボタンで90°回転
*/

(() => {
  // ====== 基本設定 ======
  const boardSVG = document.getElementById('board');
  const trayEl = document.getElementById('tray');
  const statusEl = document.getElementById('status');
  const puzzleLabel = document.getElementById('puzzleLabel');
  const difficultySel = document.getElementById('difficulty');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const resetBtn = document.getElementById('resetBtn');

  const CELL = 32;                 // 1マスのサイズ(px)
  const GRID_MARGIN = 16;          // 盤面余白(px)
  const MAX_PUZZLES = 30;

  // 難易度別プリセット
  const DIFF_PRESET = {
    easy:   { boardW: 12, boardH: 10, pieces: 3   },
    medium: { boardW: 14, boardH: 12, pieces: 4   },
    hard:   { boardW: 16, boardH: 12, pieces: 5   },
  };

  // 乱数（シード固定）
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      // xorshift32
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17; s >>>= 0;
      s ^= s << 5;  s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  // ====== ピース定義（各セルの(x,y)配列）======
  // 小さい子でも扱いやすいよう、扱いにくい鏡像は用意せず回転のみ
  const PIECES = [
    { id: "O2",  cells: [[0,0],[1,0],[0,1],[1,1]] },                 // 2x2
    { id: "I3",  cells: [[0,0],[1,0],[2,0]] },                       // 3直線
    { id: "I4",  cells: [[0,0],[1,0],[2,0],[3,0]] },                 // 4直線
    { id: "L3",  cells: [[0,0],[0,1],[1,1]] },                       // L(3)
    { id: "L4",  cells: [[0,0],[0,1],[0,2],[1,2]] },                 // L(4)
    { id: "T4",  cells: [[0,0],[1,0],[2,0],[1,1]] },                 // T
    { id: "S4",  cells: [[1,0],[2,0],[0,1],[1,1]] },                 // S(Z系)
    { id: "Z4",  cells: [[0,0],[1,0],[1,1],[2,1]] },                 // Z
    { id: "U5",  cells: [[0,0],[0,1],[1,1],[2,1],[2,0]] },           // U
    { id: "P5",  cells: [[0,0],[1,0],[0,1],[1,1],[0,2]] },           // P
    { id: "L5",  cells: [[0,0],[0,1],[0,2],[0,3],[1,3]] },           // L(5)
    { id: "T5",  cells: [[0,0],[1,0],[2,0],[1,1],[1,2]] },           // T(5)
  ];

  function rotateCells(cells, rot90) {
    // rot90: 0,1,2,3（90°単位の回転）
    let pts = cells.map(([x,y]) => [x, y]);
    for (let r=0; r<rot90; r++){
      pts = pts.map(([x,y]) => [y, -x]); // 原点回り90°回転
      // 最小 x,y を原点に寄せる（左上に詰める）
      let minx = Math.min(...pts.map(p=>p[0]));
      let miny = Math.min(...pts.map(p=>p[1]));
      pts = pts.map(([x,y]) => [x - minx, y - miny]);
    }
    return pts;
  }

  function aabbOf(cells){
    const xs = cells.map(c=>c[0]);
    const ys = cells.map(c=>c[1]);
    return { w: Math.max(...xs)+1, h: Math.max(...ys)+1 };
  }

  // ====== パズル生成（必ず解がある形状を作る）======
  // 1) 盤面サイズとピース数を難易度で決定
  // 2) ランダム配置でピースを互いに非重複＆盤内に収める
  // 3) その集合のユニオンを「ターゲット形状」として採用 → 必ず解ける
  function generatePuzzles(difficulty, seedBase = 12345) {
    const preset = DIFF_PRESET[difficulty];
    const puzzles = [];
    const rand = rng(seedBase ^ (difficulty === 'easy' ? 0xE1 : difficulty === 'medium' ? 0xD2 : 0xC3));

    for (let i=0;i<MAX_PUZZLES;i++){
      const boardW = preset.boardW;
      const boardH = preset.boardH;
      const pieceCount = preset.pieces;

      // ランダムに異なるピースを選ぶ
      const shuffled = PIECES.map((p,idx)=>({p, k: rand()}))
                             .sort((a,b)=>a.k-b.k)
                             .slice(0, pieceCount)
                             .map(x=>x.p);

      // ランダム配置（非重複）を試行
      const placed = [];
      const occupied = new Set(); // `${x},${y}` (盤面セル)
      let tries = 0;
      while (placed.length < pieceCount && tries < 800) {
        tries++;
        const pick = shuffled[placed.length];
        const rot = (Math.floor(rand()*4))|0;
        const cells = rotateCells(pick.cells, rot);
        const {w, h} = aabbOf(cells);

        // 余裕を持たせて配置
        const px = Math.floor(rand() * Math.max(1, boardW - w - 2)) + 1;
        const py = Math.floor(rand() * Math.max(1, boardH - h - 2)) + 1;

        // 重なり確認
        let ok = true;
        for (const [cx,cy] of cells) {
          const gx = px + cx;
          const gy = py + cy;
          const key = `${gx},${gy}`;
          if (occupied.has(key)) { ok = false; break; }
        }
        if (!ok) continue;

        // 予約
        for (const [cx,cy] of cells) {
          occupied.add(`${px+cx},${py+cy}`);
        }
        placed.push({ id: pick.id, rot, x:px, y:py, cells });
      }

      // 失敗したらやり直し（このループ内で完結させる）
      if (placed.length !== pieceCount) { i--; continue; }

      // ターゲット形状マスクを作成
      const targetMask = new Set([...occupied]);

      puzzles.push({
        difficulty,
        boardW, boardH,
        pieces: placed.map(pp => ({ id: pp.id })), // 問題に使うピースID
        solution: placed,                           // 正解配置（内部用）
        targetMask: [...targetMask].map(k=>k.split(',').map(Number)) // [[x,y],...]
      });
    }
    return puzzles;
  }

  // 難易度ごとに30問ずつ生成（ロード時に一度だけ）
  const ALL = {
    easy:   generatePuzzles('easy',   0xA1B2C3),
    medium: generatePuzzles('medium', 0xB1C2D3),
    hard:   generatePuzzles('hard',   0xC1D2E3),
  };

  // ====== 盤面描画 ======
  function clearSVG(svg){
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function drawBoardGrid(svg, cols, rows){
    const width = cols*CELL + GRID_MARGIN*2;
    const height = rows*CELL + GRID_MARGIN*2;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // 背景
    const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', width); bg.setAttribute('height', height);
    bg.setAttribute('fill', 'transparent');
    svg.appendChild(bg);

    // グリッド
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
    // mask: [[x,y],...]
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

  // ====== ピース生成・UI ======
  function getPieceById(id){ return PIECES.find(p=>p.id===id); }

  // ドラッグ状態
  let drag = null;

  function makePieceGroup(svg, pieceId, startX, startY, startRot=0){
    const def = getPieceById(pieceId);
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('data-id', pieceId);
    g.setAttribute('data-rot', String(startRot));
    g.setAttribute('tabindex', '0');

    // セル描画
    const cells = rotateCells(def.cells, startRot);
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

    // 透明なカバー（ドラッグ取りやすさ向上）
    const cover = document.createElementNS('http://www.w3.org/2000/svg','rect');
    const bb = bboxOfCells(cells);
    cover.setAttribute('x', GRID_MARGIN + (startX+bb.minx)*CELL);
    cover.setAttribute('y', GRID_MARGIN + (startY+bb.miny)*CELL);
    cover.setAttribute('width', (bb.maxx-bb.minx+1)*CELL);
    cover.setAttribute('height', (bb.maxy-bb.miny+1)*CELL);
    cover.setAttribute('fill', 'transparent');
    cover.style.cursor = 'grab';
    g.appendChild(cover);

    // ドラッグ処理（Pointer Events）
    g.addEventListener('pointerdown', (ev)=>{
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);
      const {x,y} = svgPoint(boardSVG, ev.clientX, ev.clientY);
      drag = {
        target: g,
        startMouse: {x, y},
        startCells: getCellsOfPiece(g),
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
      // スナップ＆当たり判定
      const ok = validatePlacement(g);
      g.classList.toggle('piece-good', ok);
      g.classList.toggle('piece-bad', !ok);
      drag.target.releasePointerCapture(ev.pointerId);
      const coverEl = g.querySelector('rect[fill="transparent"]');
      if (coverEl) coverEl.style.cursor = 'grab';
      drag = null;
      checkClear();
    });

    svg.appendChild(g);
    return g;
  }

  function bboxOfCells(cells){
    const xs = cells.map(c=>c[0]);
    const ys = cells.map(c=>c[1]);
    return { minx:Math.min(...xs), miny:Math.min(...ys), maxx:Math.max(...xs), maxy:Math.max(...ys) };
  }

  function svgPoint(svg, clientX, clientY){
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  }

  function getCellsOfPiece(g){
    const id = g.getAttribute('data-id');
    const rot = parseInt(g.getAttribute('data-rot')||'0',10);
    return rotateCells(getPieceById(id).cells, rot);
  }

  function getTopLeftOfPiece(g){
    // セル群の最小(x,y)＝基準位置
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
    // カバーも動かす
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
    // 回転後も左上座標を維持する
    const tl = getTopLeftOfPiece(g);
    const id = g.getAttribute('data-id');
    const cells = rotateCells(getPieceById(id).cells, rot);
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
      cover.setAttribute('height', (bb.maxx-bb.minx+1)*CELL); // width set above; fix height:
      cover.setAttribute('height', (bb.maxy-bb.miny+1)*CELL);
    }
    // 回転後の配置判定も更新
    const ok = validatePlacement(g);
    g.classList.toggle('piece-good', ok);
    g.classList.toggle('piece-bad', !ok);
    checkClear();
  }

  // ====== 当たり判定・クリア判定 ======
  let currentPuzzle = null;

  function validatePlacement(g){
    if (!currentPuzzle) return false;
    const cols = currentPuzzle.boardW;
    const rows = currentPuzzle.boardH;

    // 盤内＆ターゲット形状内＆他ピース非重複
    const tl = getTopLeftOfPiece(g);
    const cells = getCellsOfPiece(g);

    // 自身の占有セル（世界座標）
    const occupy = cells.map(([cx,cy]) => [tl.x+cx, tl.y+cy]);

    // 盤内
    for (const [gx,gy] of occupy){
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return false;
    }
    // ターゲット形状内
    const mask = currentPuzzle.targetSet; // Set("x,y")
    for (const [gx,gy] of occupy){
      if (!mask.has(`${gx},${gy}`)) return false;
    }
    // 他ピースと重複なし
    const others = [...boardSVG.querySelectorAll('g[data-id]')].filter(el=>el!==g);
    const used = new Set();
    for (const og of others){
      const otl = getTopLeftOfPiece(og);
      const ocells = getCellsOfPiece(og);
      for (const [cx,cy] of ocells){
        used.add(`${otl.x+cx},${otl.y+cy}`);
      }
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
      for (const [cx,cy] of cells){
        filled.add(`${tl.x+cx},${tl.y+cy}`);
      }
    }
    // すべてのターゲットセルが埋まっているか
    let ok = true;
    for (const key of mask){
      if (!filled.has(key)){ ok=false; break; }
    }
    if (ok){
      setStatus("クリア！おめでとう！🎉","ok");
    }else{
      setStatus("もう少し！全部のマスを埋めよう。","ng");
    }
  }

  function setStatus(msg, cls){
    statusEl.textContent = msg;
    statusEl.className = "status " + (cls||"");
  }

  // ====== パズル読み込み ======
  let order = { easy:[...Array(MAX_PUZZLES).keys()], medium:[...Array(MAX_PUZZLES).keys()], hard:[...Array(MAX_PUZZLES).keys()] };
  function shuffleOrder(diff){
    const arr = order[diff];
    for (let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
  }
  shuffleOrder('easy'); shuffleOrder('medium'); shuffleOrder('hard');

  let idx = 0;

  function loadPuzzle(){
    const diff = difficultySel.value;
    const puzzles = ALL[diff];
    const nth = order[diff][idx % MAX_PUZZLES];
    const pz = JSON.parse(JSON.stringify(puzzles[nth])); // clone
    currentPuzzle = pz;
    currentPuzzle.targetSet = new Set(pz.targetMask.map(([x,y])=>`${x},${y}`));

    // 盤面更新
    clearSVG(boardSVG);
    drawBoardGrid(boardSVG, pz.boardW, pz.boardH);
    drawTargetMask(boardSVG, pz.targetMask);

    // ピースをトレイに出しつつ、盤面の左外によけて配置スタート
    renderTray(pz);
    placePiecesAside(pz);

    puzzleLabel.textContent = `問題 ${ (idx%MAX_PUZZLES)+1 } / ${MAX_PUZZLES }`;
    setStatus("ターゲット形をピースでピッタリ埋めよう！", "");
  }

  function placePiecesAside(pz){
    // 盤面の左外（x: -4〜-1 マス）に縦に並べる
    const startX = -4;
    let startY = 1;
    for (const piece of pz.pieces){
      const rot = 0;
      const g = makePieceGroup(boardSVG, piece.id, startX, startY, rot);
      startY += 4;
    }
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
      rotateBtn.textContent = '回転（選択ピース）';
      rotateBtn.addEventListener('click', ()=>{
        // 同じIDのうち、盤面上で一番最近フォーカスしたものを回転
        const candidates = [...boardSVG.querySelectorAll(`g[data-id="${piece.id}"]`)];
        // いちばん最後（=生成順）を回転（今回は1つずつ）
        const g = candidates[candidates.length-1];
        if (g) rotatePiece(g);
      });
      actions.appendChild(rotateBtn);

      head.appendChild(nm);
      head.appendChild(actions);

      const canvas = document.createElement('div');
      canvas.className = 'piece-canvas';
      canvas.innerHTML = `<svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true"></svg>`;
      const mini = canvas.querySelector('svg');
      drawMiniPiece(mini, piece.id);

      card.appendChild(head);
      card.appendChild(canvas);
      trayEl.appendChild(card);
    }

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '回転ボタンは「そのピースIDのピース」を回転します。ピースは盤面左外に並んでいます。';
    trayEl.appendChild(hint);
  }

  function drawMiniPiece(svg, id){
    const cells = getPieceById(id).cells;
    const {minx,miny,maxx,maxy} = bboxOfCells(cells);
    const w = (maxx-minx+1), h = (maxy-miny+1);
    const scale = Math.min(100/(w*CELL), 100/(h*CELL));
    const offx = (120 - w*CELL*scale)/2;
    const offy = (120 - h*CELL*scale)/2;
    for (const [cx,cy] of cells){
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', offx + (cx-minx)*CELL*scale);
      r.setAttribute('y', offy + (cy-miny)*CELL*scale);
      r.setAttribute('width', CELL*scale);
      r.setAttribute('height', CELL*scale);
      r.setAttribute('rx', 3); r.setAttribute('ry', 3);
      r.setAttribute('class','piece-cell');
      svg.appendChild(r);
    }
  }

  // ====== イベント ======
  nextBtn.addEventListener('click', ()=>{ idx = (idx+1)%MAX_PUZZLES; loadPuzzle(); });
  prevBtn.addEventListener('click', ()=>{ idx = (idx-1+MAX_PUZZLES)%MAX_PUZZLES; loadPuzzle(); });
  shuffleBtn.addEventListener('click', ()=>{ shuffleOrder(difficultySel.value); idx=0; loadPuzzle(); });
  resetBtn.addEventListener('click', ()=>{ loadPuzzle(); });
  difficultySel.addEventListener('change', ()=>{ idx=0; loadPuzzle(); });

  // 初期表示
  loadPuzzle();
})();
