// ============================================================
// Battle3D – Square-grid turn-based tactical combat
// ============================================================

const Battle3D = (() => {
    // ===================== CONSTANTS =====================
    const TILE_SIZE = 3.2;
    const TILE_STEP = 3.35;
    const MAP_COLS = 10;
    const MAP_ROWS = 8;
    const HEX_HEIGHT = 0.3;
    const MAX_TURNS = 25;

    const GRID_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

    // Combat stats per troop type
    const COMBAT_STATS = {
        infantry:   { mobility: 2, range: 1 },
        ranged:     { mobility: 2, range: 3 },
        magic:      { mobility: 1, range: 2 },
        cavalry:    { mobility: 3, range: 1 },
        alchemists: { mobility: 1, range: 2 },
        beasts:     { mobility: 3, range: 1 },
        constructs: { mobility: 1, range: 1 }
    };

    const TROOP_COLORS = {
        infantry:   0x4488ff,
        ranged:     0x44bb44,
        magic:      0xaa44ff,
        cavalry:    0xcc8833,
        alchemists: 0xddcc22,
        beasts:     0x888888,
        constructs: 0x556677
    };

    // Tiered enemy pools — new types unlock as enemyPower grows (driven by camp level).
    const ENEMY_POOL = [
        // Always available (tier 1, power >= 0)
        { type: 'infantry',   hpF: 1.0, dmgF: 1.0, mobility: 2, range: 1, minPower: 0   },
        { type: 'ranged',     hpF: 0.5, dmgF: 0.7, mobility: 2, range: 3, minPower: 0   },
        // Tier 2 (power >= 500, ~camp level 5)
        { type: 'cavalry',    hpF: 0.8, dmgF: 1.1, mobility: 3, range: 1, minPower: 600 },
        { type: 'beasts',     hpF: 0.7, dmgF: 1.3, mobility: 3, range: 1, minPower: 2500 },
        // Tier 3 (power >= 700, ~camp level 7)
        { type: 'magic',      hpF: 0.5, dmgF: 1.2, mobility: 1, range: 2, minPower: 1100 },
        { type: 'alchemists', hpF: 0.6, dmgF: 1.5, mobility: 2, range: 1, minPower: 1700 },
        // Tier 4 (power >= 1200, ~camp level 12)
        { type: 'constructs', hpF: 2.5, dmgF: 1.0, mobility: 1, range: 1, minPower: 2800 },
    ];

    const ENEMY_COLORS = {
        infantry:   0xcc3333,
        ranged:     0xbb4422,
        magic:      0x882266,
        cavalry:    0xaa5522,
        alchemists: 0x998822,
        beasts:     0x664444,
        constructs: 0x555566
    };

    // ===================== GRID MATH =====================
    function hexKey(q, r) { return q + ',' + r; }
    function parseKey(k) { const p = k.split(','); return { q: +p[0], r: +p[1] }; }

    function hexToWorldRaw(q, r) {
        return {
            x: q * TILE_STEP,
            z: r * TILE_STEP
        };
    }

    let gridOffsetX = 0, gridOffsetZ = 0;
    function hexToWorld(q, r) {
        const raw = hexToWorldRaw(q, r);
        return { x: raw.x - gridOffsetX, z: raw.z - gridOffsetZ };
    }

    function hexDistance(q1, r1, q2, r2) {
        const dq = q1 - q2, dr = r1 - r2;
        return Math.abs(dq) + Math.abs(dr);
    }

    function hexNeighbors(q, r) {
        return GRID_DIRS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
    }

    function offsetToAxial(col, row) {
        return { q: col, r: row };
    }

    // ===================== STATE =====================
    let scene, camera, renderer, raycaster, mouse, clock;
    let animFrameId = null;
    let running = false;
    let battleOpts = null;

    // hex grid
    const hexGrid = new Map();   // hexKey -> { q, r, col, row, mesh, overlay }
    let hexMeshGroup, overlayGroup, troopGroup;

    // troops
    let troops = [];             // { id, side, type, q, r, hp, maxHP, damage, mobility, range, hasActed, alive, mesh, hpBar }
    let nextTroopId = 1;

    // turn state
    let currentTurn = 'player';  // 'player' | 'enemy'
    let turnNumber = 1;
    let phase = 'idle';          // idle | playerSelect | playerMove | playerAttack | animating | enemyTurn | done
    let selectedTroopId = null;
    let moveTargets = new Set();
    let attackTargets = new Set();
    let damageSprites = [];

    // shared geometry & materials
    let hexGeo, overlayGeo;
    const hexMats = {};
    const overlayMats = {};

    // ===================== PUBLIC API =====================

    function startBattle(opts) {
        battleOpts = opts;
        resetState();
        initScene();
        buildEnvironment();
        createHexGrid();
        placeTroops(opts.playerPlatoons, opts.enemyPower);
        updateHUD();
        startPlayerTurn();
        running = true;
        clock = new THREE.Clock();
        animate();

        document.getElementById('battle-arena-overlay').classList.add('show');
        document.getElementById('battle-outcome-overlay').classList.add('hidden');
    }

    function closeBattle() {
        running = false;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = null;
        document.getElementById('battle-arena-overlay').classList.remove('show');
        if (window.__battle3dResize) {
            window.removeEventListener('resize', window.__battle3dResize);
            window.__battle3dResize = null;
        }
        if (renderer) { renderer.dispose(); renderer = null; }
        const canvas = document.getElementById('battle-canvas');
        canvas.removeEventListener('click', onCanvasClick);
        scene = null; camera = null;
        hexGrid.clear();
        troops = [];
        damageSprites = [];
    }

    // ===================== STATE RESET =====================

    function resetState() {
        hexGrid.clear();
        troops = [];
        nextTroopId = 1;
        currentTurn = 'player';
        turnNumber = 1;
        phase = 'idle';
        selectedTroopId = null;
        moveTargets.clear();
        attackTargets.clear();
        damageSprites = [];
        battleEnded = false;
    }

    // ===================== SCENE SETUP =====================

    function initScene() {
        const canvas = document.getElementById('battle-canvas');
        const w = window.innerWidth, h = window.innerHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1e2e);
        scene.fog = new THREE.FogExp2(0x1a1e2e, 0.012);

        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 300);
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        canvas.addEventListener('click', onCanvasClick);

        window.__battle3dResize = () => {
            if (!renderer) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', window.__battle3dResize);

        // shared geometry (square tiles)
        hexGeo = new THREE.BoxGeometry(TILE_SIZE, HEX_HEIGHT, TILE_SIZE);
        overlayGeo = new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.08, TILE_SIZE * 0.9);

        hexMats.normal  = new THREE.MeshStandardMaterial({ color: 0x3d6b3d, flatShading: true });
        hexMats.alt     = new THREE.MeshStandardMaterial({ color: 0x457845, flatShading: true });
        overlayMats.move     = new THREE.MeshBasicMaterial({ color: 0x4499ff, transparent: true, opacity: 0.45, depthWrite: false });
        overlayMats.attack   = new THREE.MeshBasicMaterial({ color: 0xff4455, transparent: true, opacity: 0.45, depthWrite: false });
        overlayMats.selected = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5, depthWrite: false });
        overlayMats.enemy    = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.35, depthWrite: false });
    }

    function buildEnvironment() {
        scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
        const sun = new THREE.DirectionalLight(0xffeedd, 0.9);
        sun.position.set(15, 30, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
        sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
        sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
        scene.add(sun);
        scene.add(new THREE.PointLight(0xff8844, 0.3, 60));

        // water plane below the grid
        const waterGeo = new THREE.PlaneGeometry(200, 200);
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a3355, roughness: 0.8 });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.5;
        scene.add(water);

        hexMeshGroup = new THREE.Group();
        overlayGroup = new THREE.Group();
        troopGroup   = new THREE.Group();
        scene.add(hexMeshGroup);
        scene.add(overlayGroup);
        scene.add(troopGroup);
    }

    // ===================== GRID CREATION =====================

    function createHexGrid() {
        // compute grid center
        let sx = 0, sz = 0, n = 0;
        for (let row = 0; row < MAP_ROWS; row++) {
            for (let col = 0; col < MAP_COLS; col++) {
                const { q, r } = offsetToAxial(col, row);
                const p = hexToWorldRaw(q, r);
                sx += p.x; sz += p.z; n++;
            }
        }
        gridOffsetX = sx / n;
        gridOffsetZ = sz / n;

        // create square tiles
        for (let row = 0; row < MAP_ROWS; row++) {
            for (let col = 0; col < MAP_COLS; col++) {
                const { q, r } = offsetToAxial(col, row);
                const pos = hexToWorld(q, r);
                const mat = (col + row) % 2 === 0 ? hexMats.normal : hexMats.alt;

                const mesh = new THREE.Mesh(hexGeo, mat);
                mesh.position.set(pos.x, HEX_HEIGHT / 2, pos.z);
                mesh.rotation.y = 0;
                mesh.receiveShadow = true;
                mesh.userData = { isHex: true, q, r, col, row };
                hexMeshGroup.add(mesh);

                // invisible overlay (hidden until highlighted)
                const ov = new THREE.Mesh(overlayGeo, overlayMats.move);
                ov.position.set(pos.x, HEX_HEIGHT + 0.04, pos.z);
                ov.rotation.y = 0;
                ov.visible = false;
                ov.userData = { isOverlay: true, q, r };
                overlayGroup.add(ov);

                hexGrid.set(hexKey(q, r), { q, r, col, row, mesh, overlay: ov });
            }
        }

        // position camera to view the grid
        camera.position.set(0, 32, 28);
        camera.lookAt(0, 0, 0);
    }

    // ===================== TROOP PLACEMENT =====================

    function placeTroops(playerPlatoons, enemyPower) {
        // --- player troops: mirror War Table 3x3 layout on the left side ---
        const formationCols = 3;
        const formationRows = 3;
        const formationStartCol = 0;
        const formationStartRow = Math.floor((MAP_ROWS - formationRows) / 2);

        // Fallback for legacy payloads without slotId.
        const fallbackPlatoons = [];

        playerPlatoons.forEach((plat, i) => {
            let col, row;
            if (Number.isInteger(plat.slotId)) {
                const slotCol = plat.slotId % formationCols;
                const slotRow = Math.floor(plat.slotId / formationCols);
                col = formationStartCol + slotCol;
                row = formationStartRow + slotRow;
            } else {
                fallbackPlatoons.push({ plat, i });
                return;
            }

            if (col < 0 || col >= MAP_COLS || row < 0 || row >= MAP_ROWS) return;
            const { q, r } = offsetToAxial(col, row);

            const stats = COMBAT_STATS[plat.type] || { mobility: 2, range: 1 };
            const totalHP = plat.hp * plat.count;
            const totalDmg = plat.damage * plat.count;

            addTroop({
                side: 'player', type: plat.type,
                q, r,
                hp: totalHP, maxHP: totalHP,
                damage: totalDmg,
                mobility: stats.mobility, range: stats.range,
                evolutionLevel: plat.evolutionLevel
            });
        });

        // Legacy fallback: pack left if slot info is missing.
        if (fallbackPlatoons.length > 0) {
            const pCount = fallbackPlatoons.length;
            const pRowsNeeded = Math.ceil(pCount / 2);
            const pStartRow = Math.floor((MAP_ROWS - pRowsNeeded) / 2);

            fallbackPlatoons.forEach(({ plat, i }) => {
                const col = i % 2;
                const row = pStartRow + Math.floor(i / 2);
                const { q, r } = offsetToAxial(col, row);

                const stats = COMBAT_STATS[plat.type] || { mobility: 2, range: 1 };
                const totalHP = plat.hp * plat.count;
                const totalDmg = plat.damage * plat.count;

                addTroop({
                    side: 'player', type: plat.type,
                    q, r,
                    hp: totalHP, maxHP: totalHP,
                    damage: totalDmg,
                    mobility: stats.mobility, range: stats.range,
                    evolutionLevel: plat.evolutionLevel
                });
            });
        }

        // --- enemy troops: right side (cols 8-9) ---
        const enemyUnits = generateEnemyArmy(enemyPower);
        const eCount = enemyUnits.length;
        const eRowsNeeded = Math.ceil(eCount / 2);
        const eStartRow = Math.floor((MAP_ROWS - eRowsNeeded) / 2);

        enemyUnits.forEach((eu, i) => {
            const col = MAP_COLS - 1 - (i % 2);
            const row = eStartRow + Math.floor(i / 2);
            const { q, r } = offsetToAxial(col, row);

            addTroop({
                side: 'enemy', type: eu.type,
                q, r,
                hp: eu.hp, maxHP: eu.hp,
                damage: eu.damage,
                mobility: eu.mobility, range: eu.range,
                evolutionLevel: 1
            });
        });
    }

    function generateEnemyArmy(power) {
        
        // Power brackets: [100,300]→2-3, [300,700]→3-4, [700,1000]→4-5, etc.
        const brackets = [
            { maxPower: 300,  min: 1, max: 2 },
            { maxPower: 500,  min: 2, max: 3 },
            { maxPower: 900,  min: 3, max: 4 },
            { maxPower: 1400, min: 4, max: 5 },
            { maxPower: 1900, min: 5, max: 6 },
            { maxPower: 2300, min: 6, max: 7 },
            { maxPower: 2900, min: 7, max: 8 },
            { maxPower: 3500, min: 8, max: 9 },
        ];
        let minU = 8, maxU = 9; // fallback for very high power
        for (const b of brackets) {
            if (power <= b.maxPower) { minU = b.min; maxU = b.max; break; }
        }
        const numUnits = Math.min(9, minU + Math.floor(Math.random() * (maxU - minU + 1)));
        // power 100 - 0.5x ---- power 200 - 0.6x
        const baseHP = 50 + power * 0.15;
        const baseDmg = 20 + power * 0.06;

        // Filter pool to templates unlocked at this power level.
        const available = ENEMY_POOL.filter(t => power >= t.minPower);

        // Build a randomised roster from the available pool.
        // Guarantee at least one melee unit so the AI can engage.
        const meleePool = available.filter(t => t.range === 1);
        const units = [];

        for (let i = 0; i < numUnits; i++) {
            const pool = (i === 0 && meleePool.length > 0) ? meleePool : available;
            const t = pool[Math.floor(Math.random() * pool.length)];
            units.push({
                type: t.type,
                hp: Math.floor(baseHP * t.hpF),
                damage: Math.floor(baseDmg * t.dmgF),
                mobility: t.mobility,
                range: t.range
            });
        }
        return units;
    }

    function addTroop(data) {
        const id = nextTroopId++;
        const pos = hexToWorld(data.q, data.r);
        const color = data.side === 'player'
            ? (TROOP_COLORS[data.type] || 0x4488ff)
            : 0xcc3333;

        const mesh = createTroopMesh(data.type, color, data.side, data.evolutionLevel || 1);
        mesh.position.set(pos.x, HEX_HEIGHT, pos.z);
        mesh.userData = { isTroop: true, troopId: id };
        troopGroup.add(mesh);

        const hpBar = createHPBar();
        hpBar.position.set(pos.x, HEX_HEIGHT + 3.2, pos.z);
        troopGroup.add(hpBar);

        const troop = {
            id, ...data,
            hasActed: false, alive: true,
            mesh, hpBar
        };
        troops.push(troop);
        updateHPBar(troop);
        return troop;
    }

    // ===================== TROOP MESHES =====================

    function createTroopMesh(type, color, side, evolutionLevel) {
        const group = new THREE.Group();
        const s = 0.85 + (evolutionLevel - 1) * 0.1;

        if (side === 'enemy') {
            // Distinct enemy meshes per type, tinted with enemy palette
            const ec = ENEMY_COLORS[type] || 0xcc3333;
            switch (type) {
                case 'ranged': {
                    group.add(positioned(cyl(0.28, 0.32, 1.3, ec), 0, 0.95, 0));
                    group.add(positioned(sphere(0.26, 0xccbbaa), 0, 1.85, 0));
                    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 10, Math.PI),
                        new THREE.MeshStandardMaterial({ color: 0x553311 }));
                    bow.position.set(0.45, 1.2, 0);
                    bow.rotation.z = Math.PI / 2;
                    group.add(bow);
                    break;
                }
                case 'magic': {
                    group.add(positioned(cone(0.45, 1.5, ec), 0, 1, 0));
                    group.add(positioned(sphere(0.26, 0xccbbaa), 0, 2, 0));
                    group.add(positioned(cone(0.3, 0.55, darken(ec, 0.5)), 0, 2.5, 0));
                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
                        new THREE.MeshStandardMaterial({ color: 0xff6666, emissive: ec, emissiveIntensity: 0.5 }));
                    orb.position.set(0.55, 1.4, 0);
                    group.add(orb);
                    break;
                }
                case 'cavalry': {
                    const horse = box(1.4, 0.7, 0.65, 0x553311, 0);
                    horse.position.y = 0.6;
                    group.add(horse);
                    for (const lx of [-0.4, 0.4]) {
                        for (const lz of [-0.18, 0.18]) {
                            group.add(positioned(cyl(0.07, 0.07, 0.5, 0x442200), lx, 0.25, lz));
                        }
                    }
                    group.add(positioned(box(0.45, 0.8, 0.45, ec, 0), 0, 1.45, 0));
                    group.add(positioned(sphere(0.2, 0xccbbaa), 0, 2.1, 0));
                    break;
                }
                case 'alchemists': {
                    group.add(positioned(cyl(0.3, 0.35, 1.2, ec), 0, 0.9, 0));
                    group.add(positioned(sphere(0.26, 0xccbbaa), 0, 1.8, 0));
                    const flask = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
                        new THREE.MeshStandardMaterial({ color: 0xcc4444, emissive: 0xaa2222, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 }));
                    flask.position.set(0.45, 1.1, 0);
                    group.add(flask);
                    break;
                }
                case 'beasts': {
                    group.add(positioned(box(1.1, 0.55, 0.6, 0x553333, 0), 0, 0.45, 0));
                    group.add(positioned(box(0.45, 0.35, 0.4, 0x664444, 0), 0.6, 0.55, 0));
                    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                    [-0.08, 0.08].forEach(z => {
                        const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeM);
                        e.position.set(0.75, 0.65, z);
                        group.add(e);
                    });
                    break;
                }
                case 'constructs': {
                    group.add(positioned(box(0.9, 1.6, 0.8, 0x445566, 0.5), 0, 1, 0));
                    group.add(positioned(box(0.55, 0.45, 0.55, 0x556677, 0.4), 0, 2.1, 0));
                    const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2222 });
                    [-0.12, 0.12].forEach(z => {
                        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeM);
                        e.position.set(0.15, 2.15, z);
                        group.add(e);
                    });
                    break;
                }
                default: { // infantry and any unknown
                    const body = box(0.9, 1.5, 0.7, ec, 0.3);
                    body.position.y = 1;
                    group.add(body);
                    group.add(positioned(sphere(0.3, 0xccbbaa), 0, 2, 0));
                    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                    [-0.1, 0.1].forEach(z => {
                        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
                        eye.position.set(0.25, 2.05, z);
                        group.add(eye);
                    });
                    const sword = box(0.08, 0.9, 0.14, 0x444444, 0.6);
                    sword.position.set(0.5, 1.2, 0);
                    sword.rotation.z = -0.3;
                    group.add(sword);
                    break;
                }
            }
        } else {
            switch (type) {
                case 'infantry': {
                    group.add(positioned(box(0.8, 1.3, 0.6, color, 0.3), 0, 0.95, 0));
                    group.add(positioned(sphere(0.28, 0xffddbb), 0, 1.9, 0));
                    group.add(positioned(box(0.12, 0.8, 0.55, 0x999999, 0.5), -0.48, 0.95, 0));
                    break;
                }
                case 'ranged': {
                    group.add(positioned(cyl(0.28, 0.32, 1.3, color), 0, 0.95, 0));
                    group.add(positioned(sphere(0.26, 0xffddbb), 0, 1.85, 0));
                    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 10, Math.PI),
                        new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
                    bow.position.set(0.45, 1.2, 0);
                    bow.rotation.z = Math.PI / 2;
                    group.add(bow);
                    break;
                }
                case 'magic': {
                    group.add(positioned(cone(0.45, 1.5, color), 0, 1, 0));
                    group.add(positioned(sphere(0.26, 0xffddbb), 0, 2, 0));
                    group.add(positioned(cone(0.3, 0.55, darken(color, 0.5)), 0, 2.5, 0));
                    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
                        new THREE.MeshStandardMaterial({ color: 0xeeeeff, emissive: color, emissiveIntensity: 0.5 }));
                    orb.position.set(0.55, 1.4, 0);
                    group.add(orb);
                    break;
                }
                case 'cavalry': {
                    const horse = box(1.4, 0.7, 0.65, 0x8B6914, 0);
                    horse.position.y = 0.6;
                    group.add(horse);
                    for (const lx of [-0.4, 0.4]) {
                        for (const lz of [-0.18, 0.18]) {
                            group.add(positioned(cyl(0.07, 0.07, 0.5, 0x7B5914), lx, 0.25, lz));
                        }
                    }
                    group.add(positioned(box(0.45, 0.8, 0.45, color, 0), 0, 1.45, 0));
                    group.add(positioned(sphere(0.2, 0xffddbb), 0, 2.1, 0));
                    break;
                }
                case 'alchemists': {
                    group.add(positioned(cyl(0.3, 0.35, 1.2, color), 0, 0.9, 0));
                    group.add(positioned(sphere(0.26, 0xffddbb), 0, 1.8, 0));
                    const flask = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
                        new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22aa22, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 }));
                    flask.position.set(0.45, 1.1, 0);
                    group.add(flask);
                    break;
                }
                case 'beasts': {
                    group.add(positioned(box(1.1, 0.55, 0.6, 0x777777, 0), 0, 0.45, 0));
                    group.add(positioned(box(0.45, 0.35, 0.4, 0x888888, 0), 0.6, 0.55, 0));
                    break;
                }
                case 'constructs': {
                    group.add(positioned(box(0.9, 1.6, 0.8, 0x778899, 0.5), 0, 1, 0));
                    group.add(positioned(box(0.55, 0.45, 0.55, 0x8899aa, 0.4), 0, 2.1, 0));
                    const eyeM = new THREE.MeshBasicMaterial({ color: 0x00ffff });
                    [-0.12, 0.12].forEach(z => {
                        const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeM);
                        e.position.set(0.15, 2.15, z);
                        group.add(e);
                    });
                    break;
                }
                default: {
                    group.add(positioned(box(0.8, 1.3, 0.6, color, 0), 0, 0.95, 0));
                    break;
                }
            }
        }
        group.scale.setScalar(s);
        group.castShadow = true;
        return group;
    }

    // mesh helpers
    function box(w, h, d, color, metal) {
        return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({ color, metalness: metal || 0, roughness: 0.7 }));
    }
    function sphere(r, color) {
        return new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8),
            new THREE.MeshStandardMaterial({ color }));
    }
    function cyl(rt, rb, h, color) {
        return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8),
            new THREE.MeshStandardMaterial({ color }));
    }
    function cone(r, h, color) {
        return new THREE.Mesh(new THREE.ConeGeometry(r, h, 6),
            new THREE.MeshStandardMaterial({ color }));
    }
    function positioned(mesh, x, y, z) {
        mesh.position.set(x, y, z);
        return mesh;
    }
    function darken(hex, f) {
        return ((((hex >> 16) & 0xff) * f) << 16)
             | ((((hex >> 8)  & 0xff) * f) << 8)
             |  (( hex        & 0xff) * f);
    }

    // ===================== HP BARS =====================

    function createHPBar() {
        const g = new THREE.Group();
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.22),
            new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
        g.add(bg);
        const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.17),
            new THREE.MeshBasicMaterial({ color: 0x44cc44, side: THREE.DoubleSide }));
        fg.position.z = 0.01;
        fg.name = 'hpFill';
        g.add(fg);
        return g;
    }

    function updateHPBar(troop) {
        if (!troop.hpBar) return;
        const pct = Math.max(0, troop.hp / troop.maxHP);
        const fg = troop.hpBar.getObjectByName('hpFill');
        if (!fg) return;
        fg.scale.x = Math.max(0.01, pct);
        fg.position.x = -(1 - pct) * 0.85;
        if (pct > 0.5) fg.material.color.setHex(0x44cc44);
        else if (pct > 0.25) fg.material.color.setHex(0xcccc44);
        else fg.material.color.setHex(0xcc4444);

        troop.hpBar.visible = troop.alive;
    }

    // ===================== HIGHLIGHTS =====================

    function clearHighlights() {
        hexGrid.forEach(h => { h.overlay.visible = false; });
        moveTargets.clear();
        attackTargets.clear();
    }

    function showHighlights(troopId) {
        clearHighlights();
        const troop = getTroop(troopId);
        if (!troop) return;

        // selected hex
        const selHex = hexGrid.get(hexKey(troop.q, troop.r));
        if (selHex) {
            selHex.overlay.material = overlayMats.selected;
            selHex.overlay.visible = true;
        }

        // movement range
        if (phase === 'playerMove') {
            const reachable = getReachableHexes(troop.q, troop.r, troop.mobility, troop.side);
            reachable.forEach((dist, key) => {
                const h = hexGrid.get(key);
                if (h) {
                    h.overlay.material = overlayMats.move;
                    h.overlay.visible = true;
                    moveTargets.add(key);
                }
            });
        }

        // attack range (from current position in move phase, or from new position in attack phase)
        const attackable = getAttackableEnemies(troop.q, troop.r, troop.range, troop.side);
        attackable.forEach(enemy => {
            const key = hexKey(enemy.q, enemy.r);
            const h = hexGrid.get(key);
            if (h) {
                h.overlay.material = overlayMats.attack;
                h.overlay.visible = true;
                attackTargets.add(key);
            }
        });
    }

    function getReachableHexes(startQ, startR, mobility, side) {
        const reachable = new Map();
        const visited = new Map();
        visited.set(hexKey(startQ, startR), 0);
        const queue = [{ q: startQ, r: startR, dist: 0 }];

        while (queue.length > 0) {
            const { q, r, dist } = queue.shift();
            if (dist > 0) {
                const occ = findTroopAt(q, r);
                if (!occ) reachable.set(hexKey(q, r), dist);
            }
            if (dist >= mobility) continue;

            for (const [dq, dr] of GRID_DIRS) {
                const nq = q + dq, nr = r + dr;
                const nk = hexKey(nq, nr);
                if (!hexGrid.has(nk)) continue;
                const prevDist = visited.get(nk);
                if (prevDist !== undefined && prevDist <= dist + 1) continue;
                const occ = findTroopAt(nq, nr);
                if (occ && occ.side !== side) continue; // can't pass through enemies
                visited.set(nk, dist + 1);
                queue.push({ q: nq, r: nr, dist: dist + 1 });
            }
        }
        return reachable;
    }

    function getAttackableEnemies(q, r, range, side) {
        return troops.filter(t =>
            t.alive && t.side !== side &&
            hexDistance(q, r, t.q, t.r) <= range
        );
    }

    // ===================== INPUT =====================

    function onCanvasClick(event) {
        if (phase === 'animating' || phase === 'enemyTurn' || phase === 'done' || phase === 'idle') return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // raycast against hex tiles and troop meshes
        const allTargets = [...hexMeshGroup.children, ...troopGroup.children];
        const hits = raycaster.intersectObjects(allTargets, true);
        if (hits.length === 0) return;

        // find the hex coordinate from the hit
        let hitHex = null;
        let hitTroop = null;
        for (const hit of hits) {
            let obj = hit.object;
            while (obj) {
                if (obj.userData && obj.userData.isHex) {
                    hitHex = { q: obj.userData.q, r: obj.userData.r };
                    break;
                }
                if (obj.userData && obj.userData.isTroop) {
                    hitTroop = getTroop(obj.userData.troopId);
                    break;
                }
                obj = obj.parent;
            }
            if (hitHex || hitTroop) break;
        }

        // if we hit a troop, translate to its hex
        if (hitTroop && !hitHex) {
            hitHex = { q: hitTroop.q, r: hitTroop.r };
        }
        if (!hitHex) return;

        const key = hexKey(hitHex.q, hitHex.r);
        const troopAtHex = findTroopAt(hitHex.q, hitHex.r);

        if (phase === 'playerSelect' || phase === 'playerMove') {
            handlePlayerSelectOrMove(hitHex, key, troopAtHex);
        } else if (phase === 'playerAttack') {
            handlePlayerAttack(hitHex, key, troopAtHex);
        }
    }

    function handlePlayerSelectOrMove(hitHex, key, troopAtHex) {
        // clicked a move target?
        if (phase === 'playerMove' && moveTargets.has(key)) {
            const troop = getTroop(selectedTroopId);
            if (!troop) return;
            phase = 'animating';
            clearHighlights();
            const path = findPath(troop.q, troop.r, hitHex.q, hitHex.r, troop.side);
            animateMovement(troop, path, () => {
                troop.q = hitHex.q;
                troop.r = hitHex.r;
                // after moving, go to attack phase
                phase = 'playerAttack';
                showHighlights(selectedTroopId);
                updateHUD();
                // if no attack targets, skip attack
                if (attackTargets.size === 0) {
                    finishTroopAction(troop);
                }
            });
            return;
        }

        // clicked an attack target? (can attack without moving first)
        if (attackTargets.has(key) && troopAtHex && troopAtHex.side === 'enemy') {
            const troop = getTroop(selectedTroopId);
            if (!troop) return;
            phase = 'animating';
            clearHighlights();
            executeAttack(troop, troopAtHex, () => {
                finishTroopAction(troop);
            });
            return;
        }

        // clicked own unspent troop → select it
        if (troopAtHex && troopAtHex.side === 'player' && !troopAtHex.hasActed && troopAtHex.alive) {
            selectTroop(troopAtHex.id);
            return;
        }

        // clicked elsewhere → deselect
        deselectTroop();
    }

    function handlePlayerAttack(hitHex, key, troopAtHex) {
        // clicked an attack target
        if (attackTargets.has(key) && troopAtHex && troopAtHex.side === 'enemy') {
            const troop = getTroop(selectedTroopId);
            if (!troop) return;
            phase = 'animating';
            clearHighlights();
            executeAttack(troop, troopAtHex, () => {
                finishTroopAction(troop);
            });
            return;
        }

        // clicked own unspent troop → finish current without attack, select new
        if (troopAtHex && troopAtHex.side === 'player' && !troopAtHex.hasActed && troopAtHex.alive) {
            const cur = getTroop(selectedTroopId);
            if (cur) finishTroopAction(cur);
            selectTroop(troopAtHex.id);
            return;
        }

        // clicked elsewhere → skip attack, finish
        const troop = getTroop(selectedTroopId);
        if (troop) finishTroopAction(troop);
    }

    function selectTroop(id) {
        selectedTroopId = id;
        phase = 'playerMove';
        showHighlights(id);
        updateHUD();
    }

    function deselectTroop() {
        selectedTroopId = null;
        clearHighlights();
        phase = 'playerSelect';
        updateHUD();
    }

    function finishTroopAction(troop) {
        troop.hasActed = true;
        if (troop.alive) dimTroop(troop); // only dim if still alive
        selectedTroopId = null;
        clearHighlights();
        phase = 'playerSelect';
        updateHUD();

        // check if battle is over
        if (checkBattleEnd()) return;

        // auto-end turn if all player troops have acted
        const unacted = troops.filter(t => t.side === 'player' && t.alive && !t.hasActed);
        if (unacted.length === 0) {
            setTimeout(() => endPlayerTurn(), 400);
        }
    }

    function dimTroop(troop) {
        if (!troop.alive) return; // don't dim dead troops
        troop.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                if (!child.material._dimmed) {
                    child.material = child.material.clone();
                    child.material._dimmed = true;
                }
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                    child.material.emissiveIntensity = 0;
                }
                // Darken instead of fading out to avoid "invisible troop" perception.
                child.material.transparent = false;
                child.material.opacity = 1.0;
                if (child.material.color && !child.material._baseColor) {
                    child.material._baseColor = child.material.color.clone();
                }
                if (child.material.color && child.material._baseColor) {
                    child.material.color.copy(child.material._baseColor).multiplyScalar(0.55);
                }
            }
        });
    }

    function undimTroop(troop) {
        if (!troop.alive) return; // don't undim dead troops
        troop.mesh.visible = true; // ensure group visibility is on
        troop.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                    child.material.emissiveIntensity = 0;
                }
                child.material.opacity = 1.0;
                child.material.transparent = false;
                if (child.material.color && child.material._baseColor) {
                    child.material.color.copy(child.material._baseColor);
                }
                child.material._dimmed = false;
                child.material._killFade = false;
            }
        });
    }

    function ensureTroopRenderable(troop) {
        if (!troop || !troop.alive || !troop.mesh) return;
        troop.mesh.visible = true;
        troop.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                if (child.material.emissive) {
                    child.material.emissive.setHex(0x000000);
                    child.material.emissiveIntensity = 0;
                }
                child.material._killFade = false;
                child.material.transparent = false;
                child.material.opacity = 1.0;
            }
        });
    }

    // ===================== COMBAT =====================

    function executeAttack(attacker, defender, callback) {
        const atkPos = hexToWorld(attacker.q, attacker.r);
        const defPos = hexToWorld(defender.q, defender.r);

        // lunge animation
        const lungeDir = new THREE.Vector3(defPos.x - atkPos.x, 0, defPos.z - atkPos.z).normalize();
        const lungeAmount = attacker.range === 1 ? 0.8 : 0.3;
        const startPos = attacker.mesh.position.clone();

        animateLunge(attacker.mesh, lungeDir, lungeAmount, 150, () => {
            try {
                // resolve damage
                const variance = 0.8 + Math.random() * 0.4;
                const dmg = Math.floor(attacker.damage * variance);
                defender.hp -= dmg;
                showDamageNumber(defPos, dmg, '#ff4444');
                flashMesh(defender.mesh, 0xff0000, 300);
                updateHPBar(defender);

                // counter-attack for melee (only if defender survives)
                let counterDmg = 0;
                if (attacker.range === 1 && defender.hp > 0) {
                    const cv = 0.8 + Math.random() * 0.4;
                    counterDmg = Math.floor(defender.damage * 0.5 * cv);
                    attacker.hp -= counterDmg;
                    showDamageNumber(atkPos, counterDmg, '#ffaa44');
                    flashMesh(attacker.mesh, 0xff8800, 300);
                    updateHPBar(attacker);
                }

                // check deaths
                const defenderDied = defender.hp <= 0;
                const attackerDied = attacker.hp <= 0;
                if (defenderDied) killTroop(defender);
                if (attackerDied) killTroop(attacker);

                // if attacker died, skip lunge-back — let the fall animation play cleanly
                if (attackerDied) {
                    setTimeout(callback, 350);
                    return;
                }

                // return to start position
                animateLunge(attacker.mesh, lungeDir, -lungeAmount, 150, () => {
                    attacker.mesh.position.copy(startPos);
                    // Safety reset: attacking should never leave a living unit invisible.
                    ensureTroopRenderable(attacker);
                    ensureTroopRenderable(defender);
                    setTimeout(callback, 100);
                });
            } catch (err) {
                console.error('executeAttack failed, recovering turn flow:', err);
                attacker.mesh.position.copy(startPos);
                ensureTroopRenderable(attacker);
                ensureTroopRenderable(defender);
                setTimeout(callback, 0);
            }
        });
    }

    function killTroop(troop) {
        if (!troop.alive) return; // already dead, prevent double-kill
        troop.alive = false;
        troop.hp = 0;
        updateHPBar(troop);

        // snapshot the mesh position for the fall animation
        const fallStartY = troop.mesh.position.y;

        // fall animation
        const startTime = performance.now();
        const dur = 600;
        function fall() {
            if (!troop.mesh.visible) return; // already cleaned up
            const t = Math.min(1, (performance.now() - startTime) / dur);
            const e = 1 - (1 - t) * (1 - t);
            troop.mesh.rotation.x = e * (-Math.PI / 2);
            troop.mesh.position.y = fallStartY - e * 0.6;
            troop.mesh.traverse(c => {
                if (c.isMesh && c.material) {
                    if (!c.material._killFade) {
                        c.material = c.material.clone();
                        c.material._killFade = true;
                    }
                    c.material.transparent = true;
                    c.material.opacity = 1 - e;
                }
            });
            if (t < 1) requestAnimationFrame(fall);
            else {
                troop.mesh.visible = false;
                troop.hpBar.visible = false;
            }
        }
        fall();

        // particles
        const pos = hexToWorld(troop.q, troop.r);
        for (let i = 0; i < 8; i++) spawnParticle(pos, troop.side === 'player' ? 0x4488ff : 0xff4444);
    }

    // ===================== MOVEMENT ANIMATION =====================

    function findPath(sq, sr, eq, er, side) {
        const queue = [{ q: sq, r: sr, path: [] }];
        const visited = new Set([hexKey(sq, sr)]);

        while (queue.length > 0) {
            const { q, r, path } = queue.shift();
            for (const [dq, dr] of GRID_DIRS) {
                const nq = q + dq, nr = r + dr;
                const nk = hexKey(nq, nr);
                if (visited.has(nk) || !hexGrid.has(nk)) continue;
                const newPath = [...path, { q: nq, r: nr }];
                if (nq === eq && nr === er) return newPath;
                const occ = findTroopAt(nq, nr);
                if (occ && occ.side !== side) continue;
                visited.add(nk);
                queue.push({ q: nq, r: nr, path: newPath });
            }
        }
        return [{ q: eq, r: er }]; // fallback
    }

    function animateMovement(troop, path, callback) {
        if (!path || path.length === 0) { callback(); return; }
        const stepDur = 180;
        let step = 0;

        function nextStep() {
            if (step >= path.length) { callback(); return; }
            const target = hexToWorld(path[step].q, path[step].r);
            const startPos = { x: troop.mesh.position.x, z: troop.mesh.position.z };
            const startTime = performance.now();

            // rotate to face movement direction
            const dx = target.x - startPos.x;
            const dz = target.z - startPos.z;
            troop.mesh.rotation.y = Math.atan2(dx, dz);

            function lerp() {
                const t = Math.min(1, (performance.now() - startTime) / stepDur);
                const e = t * t * (3 - 2 * t);
                troop.mesh.position.x = startPos.x + (target.x - startPos.x) * e;
                troop.mesh.position.z = startPos.z + (target.z - startPos.z) * e;
                troop.hpBar.position.x = troop.mesh.position.x;
                troop.hpBar.position.z = troop.mesh.position.z;
                if (t < 1) requestAnimationFrame(lerp);
                else { step++; nextStep(); }
            }
            lerp();
        }
        nextStep();
    }

    function animateLunge(mesh, dir, amount, duration, callback) {
        const startX = mesh.position.x, startZ = mesh.position.z;
        const startTime = performance.now();
        function step() {
            const t = Math.min(1, (performance.now() - startTime) / duration);
            const e = Math.sin(t * Math.PI); // ease in-out
            mesh.position.x = startX + dir.x * amount * e;
            mesh.position.z = startZ + dir.z * amount * e;
            if (t < 1) requestAnimationFrame(step);
            else callback();
        }
        step();
    }

    // ===================== VFX =====================

    let particles = [];

    function spawnParticle(pos, color) {
        const geo = new THREE.SphereGeometry(0.12, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(
            pos.x + (Math.random() - 0.5) * 1.5,
            HEX_HEIGHT + 1 + Math.random() * 1.5,
            pos.z + (Math.random() - 0.5) * 1.5
        );
        scene.add(m);
        particles.push({
            mesh: m,
            vel: new THREE.Vector3((Math.random()-0.5)*3, 2+Math.random()*2, (Math.random()-0.5)*3),
            life: 1.0, decay: 1.5 + Math.random()
        });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.vel.y -= 6 * dt;
            p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
            p.life -= p.decay * dt;
            p.mesh.material.opacity = Math.max(0, p.life);
            if (p.life <= 0) {
                scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                particles.splice(i, 1);
            }
        }
    }

    function showDamageNumber(pos, damage, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText('-' + damage, 66, 50);
        ctx.fillStyle = color;
        ctx.fillText('-' + damage, 64, 48);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(pos.x + (Math.random()-0.5)*0.5, HEX_HEIGHT + 3.5, pos.z);
        sprite.scale.set(2.5, 1.25, 1);
        scene.add(sprite);

        const startY = sprite.position.y;
        const startTime = performance.now();
        function anim() {
            const t = (performance.now() - startTime) / 1200;
            if (t >= 1) { scene.remove(sprite); tex.dispose(); mat.dispose(); return; }
            sprite.position.y = startY + t * 2.5;
            mat.opacity = 1 - t * t;
            requestAnimationFrame(anim);
        }
        anim();
    }

    function flashMesh(mesh, color, duration) {
        if (!mesh.visible) return; // don't flash invisible meshes
        const targets = [];
        mesh.traverse(c => {
            if (!c.isMesh || !c.material) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            for (const mat of mats) {
                if (!mat || mat._killFade) continue;
                if (!mat.emissive || typeof mat.clone !== 'function') continue;
                // clone so flash doesn't mutate shared material references
                const clone = mat.clone();
                clone.emissive = new THREE.Color(color);
                clone.emissiveIntensity = 0.6;
                targets.push(clone);
                // assign clone back, preserving array/single shape
                if (Array.isArray(c.material)) {
                    const idx = c.material.indexOf(mat);
                    if (idx >= 0) c.material[idx] = clone;
                } else {
                    c.material = clone;
                }
            }
        });
        setTimeout(() => {
            targets.forEach(mat => {
                if (mat && !mat._killFade && mat.emissive) {
                    mat.emissive = new THREE.Color(0x000000);
                    mat.emissiveIntensity = 0;
                }
            });
        }, duration);
    }

    // ===================== TURN MANAGEMENT =====================

    function startPlayerTurn() {
        currentTurn = 'player';
        phase = 'playerSelect';
        selectedTroopId = null;
        clearHighlights();

        // reset all player troops
        troops.filter(t => t.side === 'player' && t.alive).forEach(t => {
            t.hasActed = false;
            undimTroop(t);
        });
        updateHUD();
    }

    function endPlayerTurn() {
        // mark any unacted troops as acted
        troops.filter(t => t.side === 'player' && t.alive && !t.hasActed).forEach(t => {
            t.hasActed = true;
            dimTroop(t);
        });
        selectedTroopId = null;
        clearHighlights();

        if (checkBattleEnd()) return;

        // start enemy turn
        currentTurn = 'enemy';
        phase = 'enemyTurn';
        turnNumber++;
        updateHUD();
        setTimeout(() => runEnemyTurn(), 600);
    }

    function checkBattleEnd() {
        const playersAlive = troops.some(t => t.side === 'player' && t.alive);
        const enemiesAlive = troops.some(t => t.side === 'enemy' && t.alive);

        if (!enemiesAlive) { endBattle(true); return true; }
        if (!playersAlive) { endBattle(false); return true; }
        if (turnNumber >= MAX_TURNS) {
            // whoever has more HP % wins
            const pHP = troops.filter(t => t.side === 'player' && t.alive).reduce((s,t) => s + t.hp / t.maxHP, 0);
            const eHP = troops.filter(t => t.side === 'enemy' && t.alive).reduce((s,t) => s + t.hp / t.maxHP, 0);
            endBattle(pHP >= eHP);
            return true;
        }
        return false;
    }

    let battleEnded = false; // guard against double calls

    function endBattle(victory) {
        if (battleEnded) return;
        battleEnded = true;
        phase = 'done';
        clearHighlights();

        setTimeout(() => {
            const overlay = document.getElementById('battle-outcome-overlay');
            const text = document.getElementById('battle-outcome-text');
            text.innerHTML = victory
                ? '<span class="victory-text">VICTORY!</span>'
                : '<span class="defeat-text">DEFEAT</span>';
            overlay.classList.remove('hidden');
        }, 600);

        if (battleOpts && battleOpts.onComplete) {
            setTimeout(() => battleOpts.onComplete({ victory }), 400);
        }
    }

    // ===================== AI =====================

    function runEnemyTurn() {
        const enemyTroops = troops.filter(t => t.side === 'enemy' && t.alive);
        enemyTroops.forEach(t => { t.hasActed = false; });

        let index = 0;
        function processNext() {
            // stop if battle already ended
            if (battleEnded || phase === 'done') return;

            if (index >= enemyTroops.length) {
                // enemy turn done
                if (checkBattleEnd()) return;
                startPlayerTurn();
                return;
            }

            const unit = enemyTroops[index];
            index++;
            if (!unit.alive) { processNext(); return; }

            aiActUnit(unit, () => {
                if (battleEnded || phase === 'done') return;
                unit.hasActed = true;
                if (checkBattleEnd()) return;
                setTimeout(processNext, 500);
            });
        }
        setTimeout(processNext, 400);
    }

    function aiActUnit(unit, callback) {
        const playerTargets = troops.filter(t => t.side === 'player' && t.alive);
        if (playerTargets.length === 0) { callback(); return; }

        // sort targets: closest first, then lowest HP
        playerTargets.sort((a, b) => {
            const da = hexDistance(unit.q, unit.r, a.q, a.r);
            const db = hexDistance(unit.q, unit.r, b.q, b.r);
            if (da !== db) return da - db;
            return a.hp - b.hp;
        });

        const primaryTarget = playerTargets[0];

        // can attack from current position?
        if (hexDistance(unit.q, unit.r, primaryTarget.q, primaryTarget.r) <= unit.range) {
            phase = 'animating';
            executeAttack(unit, primaryTarget, callback);
            return;
        }

        // find best move to get in attack range
        const reachable = getReachableHexes(unit.q, unit.r, unit.mobility, unit.side);
        let bestHex = null;
        let bestDist = Infinity;
        let canAttackAfterMove = false;

        reachable.forEach((moveDist, key) => {
            const { q, r } = parseKey(key);
            const distToTarget = hexDistance(q, r, primaryTarget.q, primaryTarget.r);
            if (distToTarget <= unit.range) {
                // can attack from here - prefer closer move
                if (!canAttackAfterMove || moveDist < bestDist) {
                    bestHex = { q, r };
                    bestDist = moveDist;
                    canAttackAfterMove = true;
                }
            } else if (!canAttackAfterMove && distToTarget < bestDist) {
                // can't attack but get closer
                bestHex = { q, r };
                bestDist = distToTarget;
            }
        });

        if (!bestHex) { callback(); return; }

        // move
        const path = findPath(unit.q, unit.r, bestHex.q, bestHex.r, unit.side);
        phase = 'animating';
        animateMovement(unit, path, () => {
            unit.q = bestHex.q;
            unit.r = bestHex.r;

            // attack if in range after moving
            if (canAttackAfterMove && primaryTarget.alive) {
                setTimeout(() => {
                    executeAttack(unit, primaryTarget, callback);
                }, 200);
            } else {
                // try to attack any target in range from new position
                const inRange = getAttackableEnemies(unit.q, unit.r, unit.range, unit.side);
                if (inRange.length > 0) {
                    setTimeout(() => {
                        executeAttack(unit, inRange[0], callback);
                    }, 200);
                } else {
                    callback();
                }
            }
        });
    }

    // ===================== HELPERS =====================

    function getTroop(id) { return troops.find(t => t.id === id); }
    function findTroopAt(q, r) { return troops.find(t => t.alive && t.q === q && t.r === r); }

    // ===================== HUD =====================

    function updateHUD() {
        const banner = document.getElementById('turn-banner');
        const turnNum = document.getElementById('turn-number');
        const endBtn = document.getElementById('end-turn-btn');
        const infoPanel = document.getElementById('unit-info-panel');

        if (banner) {
            banner.textContent = currentTurn === 'player' ? 'Your Turn' : 'Enemy Turn';
            banner.className = 'turn-banner ' + (currentTurn === 'player' ? 'player-turn' : 'enemy-turn');
        }
        if (turnNum) turnNum.textContent = 'Turn ' + turnNumber;
        if (endBtn) {
            endBtn.disabled = currentTurn !== 'player' || phase === 'animating';
            endBtn.style.opacity = endBtn.disabled ? '0.4' : '1';
        }

        // unit info
        if (infoPanel) {
            const troop = selectedTroopId ? getTroop(selectedTroopId) : null;
            if (troop) {
                infoPanel.classList.remove('hidden');
                const rangeLabel = troop.range === 1 ? 'Melee' : `Range ${troop.range}`;
                infoPanel.innerHTML = `
                    <div class="unit-info-name">${capitalize(troop.type)}</div>
                    <div class="unit-info-row"><span>HP</span><span>${Math.max(0,troop.hp)} / ${troop.maxHP}</span></div>
                    <div class="unit-info-row"><span>ATK</span><span>${troop.damage}</span></div>
                    <div class="unit-info-row"><span>Move</span><span>${troop.mobility}</span></div>
                    <div class="unit-info-row"><span>${rangeLabel}</span><span></span></div>
                `;
            } else {
                infoPanel.classList.add('hidden');
            }
        }

        // troop counts
        const pAlive = troops.filter(t => t.side === 'player' && t.alive).length;
        const eAlive = troops.filter(t => t.side === 'enemy' && t.alive).length;
        const counts = document.getElementById('troop-counts');
        if (counts) counts.textContent = `${pAlive} vs ${eAlive}`;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // ===================== ANIMATION LOOP =====================

    function animate() {
        if (!running) return;
        animFrameId = requestAnimationFrame(animate);
        const dt = clock.getDelta();
        const t = clock.getElapsedTime();

        // billboard HP bars
        troops.forEach(tr => {
            if (tr.hpBar && tr.alive) {
                tr.hpBar.quaternion.copy(camera.quaternion);
            }
        });

        // idle bob for alive troops
        troops.forEach(tr => {
            if (!tr.alive) return;
            if (phase !== 'animating') {
                // gentle bob only when not animating
            }
        });

        updateParticles(dt);
        renderer.render(scene, camera);
    }

    // ===================== WIRE END-TURN BUTTON =====================

    function wireUIButtons() {
        const endBtn = document.getElementById('end-turn-btn');
        if (endBtn) endBtn.onclick = () => {
            if (currentTurn === 'player' && phase !== 'animating' && phase !== 'done') {
                endPlayerTurn();
            }
        };
        const closeBtn = document.getElementById('battle-close-btn');
        if (closeBtn) closeBtn.onclick = () => closeBattle();
    }

    // patch startBattle to wire buttons
    const _origStart = startBattle;
    function startBattlePatched(opts) {
        _origStart(opts);
        wireUIButtons();
    }

    return { startBattle: startBattlePatched, closeBattle };
})();
