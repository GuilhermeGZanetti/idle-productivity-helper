const TASK_BASE_POINTS = 90;
const TASK_CAMP_MULTIPLIER_STEP = 0.15;
const TASK_STREAK_MULTIPLIER_STEP = 0.05;
const HERO_RECRUIT_COST = 90;
const HERO_DISMISS_REFUND = 40;
const SLOT_UNLOCK_COST = 40;

// Hero class definitions (reusing original troop archetypes).
const HERO_CLASSES = {
    infantry: { name: 'Infantry', emoji: '🛡️', baseHP: 130, hpGrowth: 18, baseDamage: 36, damageGrowth: 5, campLevel: 1},
    ranged: { name: 'Ranged', emoji: '🏹', baseHP: 90, hpGrowth: 13, baseDamage: 50, damageGrowth: 7, campLevel: 1},
    cavalry: { name: 'Cavalry', emoji: '🐴', baseHP: 145, hpGrowth: 20, baseDamage: 40, damageGrowth: 6, campLevel: 5},
    magic: { name: 'Magic', emoji: '🔮', baseHP: 80, hpGrowth: 12, baseDamage: 58, damageGrowth: 8, campLevel: 9},
    alchemists: { name: 'Alchemists', emoji: '⚗️', baseHP: 75, hpGrowth: 11, baseDamage: 54, damageGrowth: 7, campLevel: 15},
    beasts: { name: 'Beasts', emoji: '🐺', baseHP: 115, hpGrowth: 16, baseDamage: 44, damageGrowth: 6, campLevel: 20},
    constructs: { name: 'Constructs', emoji: '🤖', baseHP: 175, hpGrowth: 24, baseDamage: 33, damageGrowth: 5, campLevel: 30}
};

const gameState = {
    strategicPoints: 130,
    commandTokens: 0, // kept only for compatibility with older saves
    streak: 0,
    lastCheckIn: null,
    activities: [],
    heroes: [],
    nextHeroId: 1,
    squadSlots: Array(9).fill(null).map((_, i) => ({
        id: i,
        unlocked: i === 0,
        heroId: null
    })),
    campLevel: 1
};

function init() {
    loadGameState();
    setupEventListeners();
    render();
}

function setupEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    document.getElementById('add-activity-btn').addEventListener('click', () => {
        document.getElementById('add-activity-modal').classList.add('show');
    });

    document.querySelectorAll('.close').forEach(close => {
        close.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('show');
        });
    });

    document.getElementById('add-activity-form').addEventListener('submit', (e) => {
        e.preventDefault();
        addActivity();
    });

    document.getElementById('war-table-grid').addEventListener('click', (e) => {
        const slot = e.target.closest('.war-table-slot');
        if (slot) {
            handleSlotClick(parseInt(slot.dataset.slotId, 10));
        }
    });

    document.getElementById('deploy-btn').addEventListener('click', startBattle);
    document.getElementById('clear-placement-btn').addEventListener('click', clearPlacement);

    document.getElementById('camp-view').addEventListener('click', handleCampActions);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'war-table') {
        renderWarTable();
    } else if (tabName === 'camp') {
        renderCamp();
    }
}

function addActivity() {
    const name = document.getElementById('activity-name').value;
    const category = document.getElementById('activity-category').value;
    const frequency = document.getElementById('activity-frequency').value;
    const effort = parseInt(document.getElementById('activity-effort').value, 10);

    gameState.activities.push({
        id: Date.now(),
        name,
        category,
        frequency,
        effort,
        completed: false,
        lastCompleted: null
    });

    document.getElementById('add-activity-modal').classList.remove('show');
    document.getElementById('add-activity-form').reset();
    saveGameState();
    render();
}

function updateStreakForToday() {
    const today = new Date().toDateString();
    const lastCheckIn = gameState.lastCheckIn ? new Date(gameState.lastCheckIn).toDateString() : null;
    if (lastCheckIn === today) return;

    if (lastCheckIn && new Date(lastCheckIn).getTime() === new Date(today).getTime() - 86400000) {
        gameState.streak++;
    } else if (!lastCheckIn) {
        gameState.streak = 1;
    } else {
        gameState.streak = Math.max(0, gameState.streak - 1);
    }

    gameState.lastCheckIn = new Date().toISOString();
}

function hasCheckedInToday(activity) {
    if (!activity.lastCompleted) return false;
    return new Date(activity.lastCompleted).toDateString() === new Date().toDateString();
}

function checkInActivity(id) {
    const activity = gameState.activities.find(a => a.id === id);
    if (!activity) return;
    if (hasCheckedInToday(activity)) {
        alert('This task is already checked in today.');
        return;
    }

    updateStreakForToday();

    const campMultiplier = getCampTaskMultiplier();
    const streakMultiplier = 1 + (gameState.streak * TASK_STREAK_MULTIPLIER_STEP);
    const totalStrategicPoints = Math.floor(TASK_BASE_POINTS * campMultiplier * streakMultiplier);
    gameState.strategicPoints += totalStrategicPoints;
    activity.lastCompleted = new Date().toISOString();

    const rewardSummary = document.getElementById('reward-summary');
    if (rewardSummary) {
        rewardSummary.innerHTML = `
            <h3>Rewards Earned!</h3>
            <div class="reward-item">⚡ +${totalStrategicPoints} Strategic Points</div>
            <div class="reward-item">Task: ${activity.name}</div>
            <div class="reward-item">🏕️ Camp Multiplier: x${campMultiplier.toFixed(2)}</div>
            <div class="reward-item">🏆 Streak Multiplier: x${streakMultiplier.toFixed(2)}</div>
        `;
        rewardSummary.classList.add('show');
        setTimeout(() => rewardSummary.classList.remove('show'), 5000);
    }

    saveGameState();
    render();
}

function removeActivity(id) {
    const idx = gameState.activities.findIndex(a => a.id === id);
    if (idx === -1) return;
    if (!confirm('Remove this task?')) return;
    gameState.activities.splice(idx, 1);
    saveGameState();
    render();
}

function getHeroById(heroId) {
    return gameState.heroes.find(hero => hero.id === heroId);
}

function getHeroStats(hero) {
    const heroClass = HERO_CLASSES[hero.classKey];
    const levelBonus = Math.max(0, hero.level - 1);
    return {
        hp: Math.floor(heroClass.baseHP + (levelBonus * heroClass.hpGrowth)),
        damage: Math.floor(heroClass.baseDamage + (levelBonus * heroClass.damageGrowth))
    };
}

function getHeroUpgradeCost(hero) {
    const baseCost = 55 + (hero.level * 45);
    const xpDiscount = Math.floor(hero.xp / 4);
    return Math.max(1, baseCost - xpDiscount);
}

function getCampTaskMultiplier() {
    return 1 + ((gameState.campLevel - 1) * TASK_CAMP_MULTIPLIER_STEP);
}

function getAssignedHeroIds(excludeSlotId = null) {
    const ids = new Set();
    gameState.squadSlots.forEach(slot => {
        if (slot.id !== excludeSlotId && slot.heroId !== null) {
            ids.add(slot.heroId);
        }
    });
    return ids;
}

function renderWarTable() {
    const grid = document.getElementById('war-table-grid');
    grid.innerHTML = '';

    gameState.squadSlots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'war-table-slot';
        slotEl.dataset.slotId = slot.id;

        if (slot.unlocked) slotEl.classList.add('unlocked');
        const hero = slot.heroId !== null ? getHeroById(slot.heroId) : null;

        if (slot.unlocked && hero) {
            const heroClass = HERO_CLASSES[hero.classKey];
            slotEl.classList.add('occupied');
            slotEl.innerHTML = `
                <div class="slot-troop">${heroClass.emoji}</div>
                <div class="slot-info">${hero.name}</div>
                <div class="slot-info">Lv.${hero.level} ${heroClass.name}</div>
            `;
        } else if (slot.unlocked) {
            slotEl.innerHTML = '<div class="slot-info">Click to assign hero</div>';
        } else {
            slotEl.innerHTML = '<div class="slot-info">Locked</div>';
        }

        grid.appendChild(slotEl);
    });

    document.getElementById('unlocked-slots').textContent = gameState.squadSlots.filter(s => s.unlocked).length;
}

function handleSlotClick(slotId) {
    const slot = gameState.squadSlots[slotId];
    if (!slot) return;

    if (!slot.unlocked) {
        if (gameState.strategicPoints < SLOT_UNLOCK_COST) {
            alert(`Need ${SLOT_UNLOCK_COST} Strategic Points to unlock this slot.`);
            return;
        }

        if (confirm(`Unlock this slot for ${SLOT_UNLOCK_COST} Strategic Points?`)) {
            gameState.strategicPoints -= SLOT_UNLOCK_COST;
            slot.unlocked = true;
            saveGameState();
            renderWarTable();
            render();
        }
        return;
    }

    showHeroSelection(slotId);
}

function showHeroSelection(slotId) {
    const slot = gameState.squadSlots[slotId];
    const options = document.getElementById('upgrade-options');
    const title = document.getElementById('upgrade-modal-title');
    options.innerHTML = '';
    title.textContent = `Manage Slot ${slotId + 1}`;

    if (slot.heroId !== null) {
        const clearOption = document.createElement('div');
        clearOption.className = 'upgrade-option';
        clearOption.innerHTML = `
            <h3>Clear Slot</h3>
            <p>Remove assigned hero from this slot.</p>
        `;
        clearOption.addEventListener('click', () => {
            slot.heroId = null;
            document.getElementById('upgrade-modal').classList.remove('show');
            saveGameState();
            renderWarTable();
        });
        options.appendChild(clearOption);
    }

    const assignedElsewhere = getAssignedHeroIds(slotId);
    const availableHeroes = gameState.heroes.filter(hero => !assignedElsewhere.has(hero.id));

    if (availableHeroes.length === 0) {
        const noHero = document.createElement('div');
        noHero.className = 'upgrade-option';
        noHero.innerHTML = `
            <h3>No free heroes</h3>
            <p>Recruit a new hero in camp or clear another slot first.</p>
        `;
        options.appendChild(noHero);
    }

    availableHeroes.forEach(hero => {
        const heroClass = HERO_CLASSES[hero.classKey];
        const stats = getHeroStats(hero);
        const option = document.createElement('div');
        option.className = 'upgrade-option';
        option.innerHTML = `
            <h3>${heroClass.emoji} ${hero.name}</h3>
            <p>${heroClass.name} • Level ${hero.level}</p>
            <p>HP ${stats.hp} • ATK ${stats.damage}</p>
        `;
        option.addEventListener('click', () => {
            slot.heroId = hero.id;
            document.getElementById('upgrade-modal').classList.remove('show');
            saveGameState();
            renderWarTable();
        });
        options.appendChild(option);
    });

    document.getElementById('upgrade-modal').classList.add('show');
}

function clearPlacement() {
    if (!confirm('Clear all hero placements?')) return;
    gameState.squadSlots.forEach(slot => {
        slot.heroId = null;
    });
    saveGameState();
    renderWarTable();
}

function startBattle() {
    const deployedSlots = gameState.squadSlots.filter(slot => slot.unlocked && slot.heroId !== null);
    const deployedHeroes = deployedSlots
        .map(slot => getHeroById(slot.heroId))
        .filter(Boolean);

    if (deployedHeroes.length === 0) {
        alert('Deploy at least one hero to battle!');
        return;
    }

    const playerPlatoons = deployedSlots.map(slot => {
        const hero = getHeroById(slot.heroId);
        const stats = getHeroStats(hero);
        return {
            slotId: slot.id,
            type: hero.classKey,
            evolutionLevel: Math.min(5, Math.max(1, hero.level)),
            count: 1,
            hp: stats.hp,
            damage: stats.damage
        };
    });

    const enemyPower = (gameState.campLevel * 100);

    Battle3D.startBattle({
        playerPlatoons,
        enemyPower,
        onComplete: (result) => {
            applyBattleRewards(result, deployedHeroes);
        }
    });
}

function applyBattleRewards(result, deployedHeroes) {
    const victory = result.victory;
    const strategicPoints = victory ? 26 : 8;
    const heroXP = victory ? 14 : 6;

    gameState.strategicPoints += strategicPoints;
    if (victory) gameState.campLevel++;

    deployedHeroes.forEach(hero => {
        hero.xp += heroXP;
    });

    const nextTaskMultiplier = getCampTaskMultiplier().toFixed(2);
    const resultEl = document.getElementById('battle-result');
    resultEl.className = `battle-result show ${victory ? 'victory' : 'defeat'}`;
    resultEl.innerHTML = `
        <h3>${victory ? '🎉 Victory!' : '💔 Defeat'}</h3>
        <p>${victory ? 'Your heroes held the line.' : 'Your heroes regroup and recover.'}</p>
        <div class="reward-item">⚡ +${strategicPoints} Strategic Points</div>
        <div class="reward-item">🧠 +${heroXP} XP to deployed heroes</div>
        <div class="reward-item">🏕️ Camp Level: ${gameState.campLevel}</div>
        <div class="reward-item">✅ Next task multiplier: x${nextTaskMultiplier}</div>
    `;

    saveGameState();
    render();
}

function handleCampActions(event) {
    const recruitBtn = event.target.closest('[data-action="recruit-hero"]');
    if (recruitBtn) {
        recruitHero();
        return;
    }

    const upgradeBtn = event.target.closest('[data-action="upgrade-hero"]');
    if (upgradeBtn) {
        const heroId = Number(upgradeBtn.dataset.heroId);
        upgradeHero(heroId);
        return;
    }

    const dismissBtn = event.target.closest('[data-action="dismiss-hero"]');
    if (dismissBtn) {
        const heroId = Number(dismissBtn.dataset.heroId);
        dismissHero(heroId);
        return;
    }
}

function recruitHero() {
    if (gameState.strategicPoints < HERO_RECRUIT_COST) {
        alert(`Need ${HERO_RECRUIT_COST} Strategic Points to recruit a hero.`);
        return;
    }

    gameState.strategicPoints -= HERO_RECRUIT_COST;
    gameState.heroes.push({
        id: getNextHeroId(),
        name: createPresetHeroName(),
        classKey: getRandomHeroClassKey(),
        level: 1,
        xp: 0
    });
    saveGameState();
    renderCamp();
    renderWarTable();
    render();
}

function upgradeHero(heroId) {
    const hero = getHeroById(heroId);
    if (!hero) return;

    const cost = getHeroUpgradeCost(hero);
    if (gameState.strategicPoints < cost) {
        alert(`Need ${cost} Strategic Points to upgrade ${hero.name}.`);
        return;
    }

    if (!confirm(`Upgrade ${hero.name} to level ${hero.level + 1} for ${cost} Strategic Points?`)) return;

    gameState.strategicPoints -= cost;
    hero.level += 1;
    saveGameState();
    renderCamp();
    renderWarTable();
    render();
}

function dismissHero(heroId) {
    const hero = getHeroById(heroId);
    if (!hero) return;
    const isDeployed = gameState.squadSlots.some(slot => slot.heroId === heroId);
    const msg = isDeployed
        ? `${hero.name} is currently deployed on the War Table! Dismissing will remove them from battle formation.\n\nDismiss ${hero.name} for ${HERO_DISMISS_REFUND} Strategic Points?`
        : `Dismiss ${hero.name}? You will receive ${HERO_DISMISS_REFUND} Strategic Points.`;
    if (!confirm(msg)) return;

    // Unassign from any slot
    gameState.squadSlots.forEach(slot => {
        if (slot.heroId === heroId) slot.heroId = null;
    });

    // Remove from roster
    const idx = gameState.heroes.findIndex(h => h.id === heroId);
    if (idx !== -1) gameState.heroes.splice(idx, 1);

    gameState.strategicPoints += HERO_DISMISS_REFUND;
    saveGameState();
    renderCamp();
    renderWarTable();
    render();
}

function renderCamp() {
    const campBuilding = document.getElementById('camp-building');
    const campStats = document.getElementById('camp-stats');
    const upgradesList = document.getElementById('upgrades-list');

    const emojis = ['🏕️', '🏘️', '🏰', '🏯', '🏛️'];
    campBuilding.textContent = emojis[Math.min(gameState.campLevel - 1, emojis.length - 1)];
    const unlockedClasses = Object.entries(HERO_CLASSES)
        .filter(([, cls]) => gameState.campLevel >= cls.campLevel)
        .map(([, cls]) => cls.emoji)
        .join(' ');
    const lockedClasses = Object.entries(HERO_CLASSES)
        .filter(([, cls]) => gameState.campLevel < cls.campLevel)
        .map(([, cls]) => `${cls.emoji} ${cls.name} (camp lv.${cls.campLevel})`)
        .join(', ');

    campStats.innerHTML = `
        <div class="camp-stat">Camp Level: <strong>${gameState.campLevel}</strong></div>
        <div class="camp-stat">Task Multiplier: <strong>x${getCampTaskMultiplier().toFixed(2)}</strong></div>
        <div class="camp-stat">Recruitable Classes: ${unlockedClasses}</div>
        ${lockedClasses ? `<div class="camp-stat camp-locked">Locked: ${lockedClasses}</div>` : ''}
        <button class="btn-primary" data-action="recruit-hero" ${gameState.strategicPoints < HERO_RECRUIT_COST ? 'disabled' : ''}>
            Recruit Hero (${HERO_RECRUIT_COST} ⚡)
        </button>
    `;

    upgradesList.innerHTML = '';
    if (gameState.heroes.length === 0) {
        upgradesList.innerHTML = '<p style="text-align: center; color: #666;">No heroes yet. Recruit your first hero.</p>';
        return;
    }

    const assignedHeroIds = getAssignedHeroIds();
    gameState.heroes.forEach(hero => {
        const heroClass = HERO_CLASSES[hero.classKey];
        const stats = getHeroStats(hero);
        const upgradeCost = getHeroUpgradeCost(hero);
        const isAssigned = assignedHeroIds.has(hero.id);

        const card = document.createElement('div');
        card.className = 'hero-card';
        card.innerHTML = `
            <div class="hero-main">
                <h3>${heroClass.emoji} ${hero.name}</h3>
                <p>${heroClass.name} • Level ${hero.level}</p>
                <p>HP ${stats.hp} • ATK ${stats.damage} • XP ${hero.xp} (-${Math.floor(hero.xp / 4)} ⚡ discount)</p>
                <p>${isAssigned ? 'Assigned to War Table' : 'Reserve hero'}</p>
            </div>
            <div class="hero-actions">
                <button class="btn-primary" data-action="upgrade-hero" data-hero-id="${hero.id}" ${gameState.strategicPoints < upgradeCost ? 'disabled' : ''}>
                    Upgrade (${upgradeCost} ⚡)
                </button>
                <button class="btn-secondary" data-action="dismiss-hero" data-hero-id="${hero.id}">
                    Dismiss (+${HERO_DISMISS_REFUND} ⚡)
                </button>
            </div>
        `;
        upgradesList.appendChild(card);
    });
}

function createPresetHeroName() {
    const baseName = HERO_NAME_POOL[Math.floor(Math.random() * HERO_NAME_POOL.length)];
    const sameNameCount = gameState.heroes.filter(hero => hero.name.startsWith(baseName)).length;
    return sameNameCount > 0 ? `${baseName}, the ${sameNameCount + 1}°` : baseName;
}

function getRandomHeroClassKey() {
    const classKeys = Object.keys(HERO_CLASSES).filter(
        key => gameState.campLevel >= HERO_CLASSES[key].campLevel
    );

    // Weight inversely by how many heroes of each class you already own.
    // weight = 1 / (1 + count), so 0 owned → weight 1, 1 owned → 0.5, 2 → 0.33, etc.
    const counts = {};
    gameState.heroes.forEach(h => { counts[h.classKey] = (counts[h.classKey] || 0) + 1; });

    const weights = classKeys.map(key => 1 / (1 + (counts[key] || 0)));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < classKeys.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return classKeys[i];
    }
    return classKeys[classKeys.length - 1];
}

function getNextHeroId() {
    const id = gameState.nextHeroId;
    gameState.nextHeroId += 1;
    return id;
}

function createStarterHero() {
    const starter = {
        id: getNextHeroId(),
        name: 'Aldric',
        classKey: 'infantry',
        level: 1,
        xp: 0
    };
    gameState.heroes.push(starter);
    gameState.squadSlots[0].heroId = starter.id;
}

function migrateLegacySlot(slot) {
    const migrated = {
        id: Number.isInteger(slot?.id) ? slot.id : 0,
        unlocked: Boolean(slot?.unlocked),
        heroId: null
    };

    if (Number.isInteger(slot?.heroId)) {
        migrated.heroId = slot.heroId;
        return migrated;
    }

    if (!slot?.platoon) return migrated;
    const legacyClass = HERO_CLASSES[slot.platoon.type] ? slot.platoon.type : 'infantry';
    const legacyLevel = Number.isInteger(slot.platoon.evolutionLevel) ? slot.platoon.evolutionLevel : 1;
    const legacyXP = Number.isInteger(slot.platoon.xp) ? slot.platoon.xp : 0;
    const hero = {
        id: getNextHeroId(),
        name: createPresetHeroName(),
        classKey: legacyClass,
        level: Math.max(1, legacyLevel),
        xp: legacyXP
    };
    gameState.heroes.push(hero);
    migrated.heroId = hero.id;
    return migrated;
}

function saveGameState() {
    localStorage.setItem('idleProductivityGame', JSON.stringify(gameState));
}

function loadGameState() {
    const saved = localStorage.getItem('idleProductivityGame');
    if (!saved) {
        createStarterHero();
        return;
    }

    const loaded = JSON.parse(saved);
    gameState.strategicPoints = Number(loaded.strategicPoints) || 0;
    gameState.commandTokens = Number(loaded.commandTokens) || 0;
    gameState.streak = Number(loaded.streak) || 0;
    gameState.lastCheckIn = loaded.lastCheckIn || null;
    gameState.activities = Array.isArray(loaded.activities) ? loaded.activities : [];
    gameState.campLevel = Math.max(1, Number(loaded.campLevel) || 1);
    gameState.nextHeroId = Math.max(1, Number(loaded.nextHeroId) || 1);
    gameState.heroes = [];

    if (Array.isArray(loaded.heroes)) {
        loaded.heroes.forEach(rawHero => {
            const classKey = HERO_CLASSES[rawHero.classKey] ? rawHero.classKey : 'infantry';
            const id = Number(rawHero.id);
            if (!Number.isInteger(id)) return;
            gameState.heroes.push({
                id,
                name: rawHero.name || createPresetHeroName(),
                classKey,
                level: Math.max(1, Number(rawHero.level) || 1),
                xp: Math.max(0, Number(rawHero.xp) || 0)
            });
            gameState.nextHeroId = Math.max(gameState.nextHeroId, id + 1);
        });
    }

    const loadedSlots = Array.isArray(loaded.squadSlots) ? loaded.squadSlots : [];
    gameState.squadSlots = Array(9).fill(null).map((_, i) => {
        const slot = loadedSlots[i] || { id: i, unlocked: i === 0, heroId: null };
        const migrated = migrateLegacySlot(slot);
        migrated.id = i;
        return migrated;
    });

    // Remove invalid hero references from slots.
    const existingHeroIds = new Set(gameState.heroes.map(hero => hero.id));
    gameState.squadSlots.forEach(slot => {
        if (slot.heroId !== null && !existingHeroIds.has(slot.heroId)) {
            slot.heroId = null;
        }
    });

    if (gameState.heroes.length === 0) {
        createStarterHero();
    }
}

function render() {
    document.getElementById('strategic-points').textContent = gameState.strategicPoints;
    document.getElementById('streak').textContent = gameState.streak;

    const activitiesList = document.getElementById('activities-list');
    activitiesList.innerHTML = '';

    if (gameState.activities.length === 0) {
        activitiesList.innerHTML = '<p style="text-align: center; color: #666;">No activities yet. Add one to get started!</p>';
    } else {
        gameState.activities.forEach(activity => {
            const card = document.createElement('div');
            const checkedToday = hasCheckedInToday(activity);
            card.className = `activity-card ${checkedToday ? 'completed' : ''}`;
            const checkedLabel = checkedToday
                ? `Checked in today`
                : `${activity.category} • ${activity.frequency} • ${activity.effort} min`;
            card.innerHTML = `
                <div class="activity-info">
                    <div class="activity-name">${activity.name}</div>
                    <div class="activity-meta">${checkedLabel}</div>
                </div>
                <div class="activity-actions">
                    <button class="btn-primary task-action-btn" onclick="checkInActivity(${activity.id})" ${checkedToday ? 'disabled' : ''}>
                        ${checkedToday ? 'Checked In' : 'Check In'}
                    </button>
                    <button class="btn-secondary task-action-btn" onclick="removeActivity(${activity.id})">Remove</button>
                </div>
            `;
            activitiesList.appendChild(card);
        });
    }

    if (document.getElementById('war-table-tab').classList.contains('active')) {
        renderWarTable();
    }
    if (document.getElementById('camp-tab').classList.contains('active')) {
        renderCamp();
    }
}

window.checkInActivity = checkInActivity;
window.removeActivity = removeActivity;
document.addEventListener('DOMContentLoaded', init);
