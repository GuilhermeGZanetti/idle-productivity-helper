// Game State
const gameState = {
    strategicPoints: 0,
    commandTokens: 0,
    streak: 0,
    lastCheckIn: null,
    activities: [],
    squadSlots: Array(9).fill(null).map((_, i) => ({
        id: i,
        unlocked: i === 0,
        platoon: null
    })),
    unlockedTroopTypes: ['infantry'],
    campLevel: 1
};

// Troop Definitions
const TROOP_TYPES = {
    infantry: {
        name: 'Infantry',
        emoji: '🛡️',
        category: 'physical',
        baseHP: 100,
        baseDamage: 20,
        evolution: {
            1: { name: 'Militia', emoji: '🪵', count: 10, hp: 100, damage: 20 },
            3: { name: 'Men-at-Arms', emoji: '⚔️', count: 10, hp: 150, damage: 30 },
            5: { name: 'Paladins', emoji: '✨', count: 10, hp: 250, damage: 50 }
        }
    },
    ranged: {
        name: 'Ranged',
        emoji: '🏹',
        category: 'creative',
        baseHP: 60,
        baseDamage: 35,
        evolution: {
            1: { name: 'Hunters', emoji: '🏹', count: 8, hp: 60, damage: 35 },
            3: { name: 'Crossbowmen', emoji: '🔫', count: 8, hp: 90, damage: 50 },
            5: { name: 'Arcane Rangers', emoji: '🌟', count: 8, hp: 150, damage: 80 }
        }
    },
    magic: {
        name: 'Magic',
        emoji: '🔮',
        category: 'mental',
        baseHP: 50,
        baseDamage: 50,
        evolution: {
            1: { name: 'Novices', emoji: '🪄', count: 5, hp: 50, damage: 50 },
            3: { name: 'Elementalists', emoji: '⚡', count: 5, hp: 75, damage: 75 },
            5: { name: 'Archmages', emoji: '💫', count: 5, hp: 125, damage: 125 }
        }
    },
    cavalry: {
        name: 'Cavalry',
        emoji: '🐴',
        category: 'logistics',
        baseHP: 120,
        baseDamage: 30,
        evolution: {
            1: { name: 'Stablehands', emoji: '🐴', count: 3, hp: 120, damage: 30 },
            3: { name: 'Knights', emoji: '🐎', count: 3, hp: 180, damage: 45 },
            5: { name: 'Dragoon Lancers', emoji: '🦄', count: 3, hp: 300, damage: 75 }
        }
    },
    alchemists: {
        name: 'Alchemists',
        emoji: '⚗️',
        category: 'mental',
        baseHP: 40,
        baseDamage: 40,
        evolution: {
            1: { name: 'Apprentices', emoji: '⚗️', count: 5, hp: 40, damage: 40 },
            3: { name: 'Bombardiers', emoji: '💣', count: 5, hp: 60, damage: 60 },
            5: { name: 'Plague Doctors', emoji: '🩺', count: 5, hp: 100, damage: 100 }
        }
    },
    beasts: {
        name: 'Beasts',
        emoji: '🐺',
        category: 'creative',
        baseHP: 80,
        baseDamage: 25,
        evolution: {
            1: { name: 'Wolf Pups', emoji: '🐺', count: 4, hp: 80, damage: 25 },
            3: { name: 'Dire Wolves', emoji: '🐕', count: 4, hp: 120, damage: 40 },
            5: { name: 'Alpha Fenrirs', emoji: '🐉', count: 4, hp: 200, damage: 65 }
        }
    },
    constructs: {
        name: 'Constructs',
        emoji: '🤖',
        category: 'physical',
        baseHP: 200,
        baseDamage: 15,
        evolution: {
            1: { name: 'Clay Golems', emoji: '🧱', count: 2, hp: 200, damage: 15 },
            3: { name: 'Stone Guardians', emoji: '🗿', count: 2, hp: 300, damage: 25 },
            5: { name: 'Runic Sentinels', emoji: '⚙️', count: 2, hp: 500, damage: 40 }
        }
    }
};

// Activity Category to Troop Mapping
const CATEGORY_BUFFS = {
    physical: { types: ['infantry', 'constructs'], hp: 1.2, defense: 1.15 },
    mental: { types: ['magic', 'alchemists'], damage: 1.25, cooldown: 0.9 },
    creative: { types: ['ranged', 'beasts'], crit: 1.3, speed: 1.2 },
    logistics: { types: ['cavalry'], slots: true, resources: 1.15 }
};

// Initialize
function init() {
    loadGameState();
    setupEventListeners();
    render();
}

// Event Listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Add activity
    document.getElementById('add-activity-btn').addEventListener('click', () => {
        document.getElementById('add-activity-modal').classList.add('show');
    });

    // Close modals
    document.querySelectorAll('.close').forEach(close => {
        close.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.remove('show');
        });
    });

    // Add activity form
    document.getElementById('add-activity-form').addEventListener('submit', (e) => {
        e.preventDefault();
        addActivity();
    });

    // Check in
    document.getElementById('check-in-btn').addEventListener('click', checkIn);

    // War table slot clicks
    document.getElementById('war-table-grid').addEventListener('click', (e) => {
        const slot = e.target.closest('.war-table-slot');
        if (slot) {
            handleSlotClick(parseInt(slot.dataset.slotId));
        }
    });

    // Deploy and battle
    document.getElementById('deploy-btn').addEventListener('click', startBattle);
    document.getElementById('clear-placement-btn').addEventListener('click', clearPlacement);

    // Upgrade button in camp
    document.getElementById('camp-tab').addEventListener('click', (e) => {
        if (e.target.classList.contains('upgrade-btn')) {
            showUpgradeModal();
        }
    });
}

// Tab Switching
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

// Activity Management
function addActivity() {
    const name = document.getElementById('activity-name').value;
    const category = document.getElementById('activity-category').value;
    const frequency = document.getElementById('activity-frequency').value;
    const effort = parseInt(document.getElementById('activity-effort').value);

    const activity = {
        id: Date.now(),
        name,
        category,
        frequency,
        effort,
        completed: false,
        lastCompleted: null
    };

    gameState.activities.push(activity);
    document.getElementById('add-activity-modal').classList.remove('show');
    document.getElementById('add-activity-form').reset();
    saveGameState();
    render();
}

function toggleActivity(id) {
    const activity = gameState.activities.find(a => a.id === id);
    if (activity) {
        activity.completed = !activity.completed;
        saveGameState();
        render();
    }
}

// Check In
function checkIn() {
    const completedActivities = gameState.activities.filter(a => a.completed);
    
    if (completedActivities.length === 0) {
        alert('Complete at least one activity to check in!');
        return;
    }

    const today = new Date().toDateString();
    const lastCheckIn = gameState.lastCheckIn ? new Date(gameState.lastCheckIn).toDateString() : null;
    
    // Update streak
    if (lastCheckIn === today) {
        // Already checked in today
        return;
    } else if (lastCheckIn && new Date(lastCheckIn).getTime() === new Date(today).getTime() - 86400000) {
        // Consecutive day
        gameState.streak++;
    } else if (!lastCheckIn) {
        // First check in
        gameState.streak = 1;
    } else {
        // Missed day - gentle reset (reduce by 1)
        gameState.streak = Math.max(0, gameState.streak - 1);
    }

    gameState.lastCheckIn = new Date().toISOString();

    // Calculate rewards
    let totalStrategicPoints = 0;
    let totalCommandTokens = 0;
    const rewards = [];

    completedActivities.forEach(activity => {
        const basePoints = activity.effort / 10; // 1 point per 10 minutes
        const categoryBuff = CATEGORY_BUFFS[activity.category];
        
        let strategicPoints = Math.floor(basePoints * (1 + gameState.streak * 0.1));
        let commandTokens = Math.floor(basePoints * 0.3);
        
        if (categoryBuff.slots) {
            commandTokens = Math.floor(commandTokens * 1.5);
        }

        totalStrategicPoints += strategicPoints;
        totalCommandTokens += commandTokens;

        // Apply category buffs to troops
        const buffedTypes = categoryBuff.types || [];
        buffedTypes.forEach(type => {
            rewards.push(`${TROOP_TYPES[type].name} troops buffed!`);
        });
    });

    // Streak bonus
    if (gameState.streak > 0) {
        totalStrategicPoints = Math.floor(totalStrategicPoints * (1 + gameState.streak * 0.05));
    }

    gameState.strategicPoints += totalStrategicPoints;
    gameState.commandTokens += totalCommandTokens;

    // Mark activities as completed and reset
    completedActivities.forEach(activity => {
        activity.completed = false;
        activity.lastCompleted = new Date().toISOString();
    });

    // Show reward summary
    const rewardSummary = document.getElementById('reward-summary');
    rewardSummary.innerHTML = `
        <h3>Rewards Earned!</h3>
        <div class="reward-item">⚡ +${totalStrategicPoints} Strategic Points</div>
        <div class="reward-item">🎖️ +${totalCommandTokens} Command Tokens</div>
        ${rewards.length > 0 ? `<div class="reward-item">${rewards.join('<br>')}</div>` : ''}
        <div class="reward-item">🏆 Streak: ${gameState.streak} days</div>
    `;
    rewardSummary.classList.add('show');

    saveGameState();
    render();
    
    // Auto-hide reward summary after 5 seconds
    setTimeout(() => {
        rewardSummary.classList.remove('show');
    }, 5000);
}

// War Table
function renderWarTable() {
    const grid = document.getElementById('war-table-grid');
    grid.innerHTML = '';
    
    gameState.squadSlots.forEach(slot => {
        const slotEl = document.createElement('div');
        slotEl.className = 'war-table-slot';
        slotEl.dataset.slotId = slot.id;
        
        if (slot.unlocked) {
            slotEl.classList.add('unlocked');
        }
        
        if (slot.platoon) {
            slotEl.classList.add('occupied');
            const troop = TROOP_TYPES[slot.platoon.type];
            const evolution = troop.evolution[slot.platoon.evolutionLevel];
            slotEl.innerHTML = `
                <div class="slot-troop">${evolution.emoji}</div>
                <div class="slot-info">${evolution.name}</div>
                <div class="slot-info">Lv.${slot.platoon.evolutionLevel}</div>
            `;
        } else if (slot.unlocked) {
            slotEl.innerHTML = '<div class="slot-info">Click to assign</div>';
        } else {
            slotEl.innerHTML = '<div class="slot-info">Locked</div>';
        }
        
        grid.appendChild(slotEl);
    });
    
    document.getElementById('unlocked-slots').textContent = 
        gameState.squadSlots.filter(s => s.unlocked).length;
}

function handleSlotClick(slotId) {
    const slot = gameState.squadSlots[slotId];
    if (!slot.unlocked) {
        // Try to unlock
        if (gameState.commandTokens >= 5) {
            if (confirm('Unlock this slot for 5 Command Tokens?')) {
                gameState.commandTokens -= 5;
                slot.unlocked = true;
                saveGameState();
                renderWarTable();
                render();
            }
        } else {
            alert('Need 5 Command Tokens to unlock this slot!');
        }
        return;
    }

    // Show troop selection
    showTroopSelection(slotId);
}

function showTroopSelection(slotId) {
    const slot = gameState.squadSlots[slotId];
    const options = document.getElementById('upgrade-options');
    options.innerHTML = '';

    // Option to clear slot
    if (slot.platoon) {
        const clearOption = document.createElement('div');
        clearOption.className = 'upgrade-option';
        clearOption.innerHTML = `
            <h3>Clear Slot</h3>
            <p>Remove current platoon</p>
        `;
        clearOption.addEventListener('click', () => {
            slot.platoon = null;
            document.getElementById('upgrade-modal').classList.remove('show');
            saveGameState();
            renderWarTable();
        });
        options.appendChild(clearOption);
    }

    // Available troop types
    gameState.unlockedTroopTypes.forEach(typeKey => {
        const troop = TROOP_TYPES[typeKey];
        const evolution = troop.evolution[1]; // Start at level 1
        
        const option = document.createElement('div');
        option.className = 'upgrade-option';
        option.innerHTML = `
            <h3>${evolution.emoji} ${evolution.name}</h3>
            <p>${troop.name} - ${evolution.count} units</p>
            <p class="cost">Cost: Free (first assignment)</p>
        `;
        option.addEventListener('click', () => {
            slot.platoon = {
                type: typeKey,
                evolutionLevel: 1,
                xp: 0
            };
            document.getElementById('upgrade-modal').classList.remove('show');
            saveGameState();
            renderWarTable();
        });
        options.appendChild(option);
    });

    // Evolution options if platoon exists
    if (slot.platoon && slot.platoon.evolutionLevel < 5) {
        const troop = TROOP_TYPES[slot.platoon.type];
        const nextLevel = slot.platoon.evolutionLevel === 1 ? 3 : 5;
        const evolution = troop.evolution[nextLevel];
        const cost = nextLevel === 3 ? 10 : 25;
        
        if (gameState.commandTokens >= cost) {
            const evolveOption = document.createElement('div');
            evolveOption.className = 'upgrade-option';
            evolveOption.innerHTML = `
                <h3>Evolve to ${evolution.name}</h3>
                <p>Upgrade to Level ${nextLevel}</p>
                <p class="cost">Cost: ${cost} Command Tokens</p>
            `;
            evolveOption.addEventListener('click', () => {
                gameState.commandTokens -= cost;
                slot.platoon.evolutionLevel = nextLevel;
                document.getElementById('upgrade-modal').classList.remove('show');
                saveGameState();
                renderWarTable();
                render();
            });
            options.appendChild(evolveOption);
        }
    }

    document.getElementById('upgrade-modal').classList.add('show');
}

function clearPlacement() {
    if (confirm('Clear all troop placements?')) {
        gameState.squadSlots.forEach(slot => {
            slot.platoon = null;
        });
        saveGameState();
        renderWarTable();
    }
}

// Battle System
function startBattle() {
    const deployedSlots = gameState.squadSlots
        .filter(slot => slot.unlocked && slot.platoon);
    const deployedPlatoons = deployedSlots.map(slot => slot.platoon);

    if (deployedPlatoons.length === 0) {
        alert('Deploy at least one platoon to battle!');
        return;
    }

    // Build player platoon data for 3D battle
    const playerPlatoons = deployedSlots.map(slot => {
        const platoon = slot.platoon;
        const troop = TROOP_TYPES[platoon.type];
        const evolution = troop.evolution[platoon.evolutionLevel];
        return {
            slotId: slot.id,
            type: platoon.type,
            evolutionLevel: platoon.evolutionLevel,
            count: evolution.count,
            hp: evolution.hp,
            damage: evolution.damage
        };
    });

    // Enemy stats (scales with player progress)
    const enemyPower = 100 + (gameState.campLevel * 50);

    // Launch hex-grid tactical battle
    Battle3D.startBattle({
        playerPlatoons,
        enemyPower,
        onComplete: (result) => {
            applyBattleRewards(result, deployedPlatoons, enemyPower);
        }
    });
}

function applyBattleRewards(result, deployedPlatoons, enemyPower) {
    const victory = result.victory;

    let battleRewards = {
        strategicPoints: 0,
        commandTokens: 0,
        xp: 0
    };

    if (victory) {
        battleRewards.strategicPoints = Math.floor(enemyPower * 0.5);
        battleRewards.commandTokens = Math.floor(enemyPower * 0.1);
        battleRewards.xp = Math.floor(enemyPower * 0.3);
        gameState.campLevel++;

        deployedPlatoons.forEach(platoon => {
            platoon.xp += battleRewards.xp;
        });
    } else {
        battleRewards.strategicPoints = Math.floor(enemyPower * 0.2);
        battleRewards.commandTokens = Math.floor(enemyPower * 0.05);
    }

    gameState.strategicPoints += battleRewards.strategicPoints;
    gameState.commandTokens += battleRewards.commandTokens;

    // Show battle result in the War Table tab as well
    const resultEl = document.getElementById('battle-result');
    resultEl.className = `battle-result show ${victory ? 'victory' : 'defeat'}`;
    resultEl.innerHTML = `
        <h3>${victory ? '🎉 Victory!' : '💔 Defeat'}</h3>
        <p>${victory ? 'Enemy defeated!' : 'Your army retreated safely.'}</p>
        <div class="reward-item">⚡ +${battleRewards.strategicPoints} Strategic Points</div>
        <div class="reward-item">🎖️ +${battleRewards.commandTokens} Command Tokens</div>
        ${victory ? `<div class="reward-item">🏕️ Camp Level: ${gameState.campLevel}</div>` : ''}
    `;

    saveGameState();
    render();
}

// Camp View
function renderCamp() {
    const campBuilding = document.getElementById('camp-building');
    const emojis = ['🏕️', '🏘️', '🏰', '🏯', '🏛️'];
    campBuilding.textContent = emojis[Math.min(gameState.campLevel - 1, emojis.length - 1)];

    const upgradesList = document.getElementById('upgrades-list');
    upgradesList.innerHTML = '';

    // Unlock new troop types
    const lockedTypes = Object.keys(TROOP_TYPES).filter(
        type => !gameState.unlockedTroopTypes.includes(type)
    );

    if (lockedTypes.length > 0) {
        lockedTypes.forEach(typeKey => {
            const troop = TROOP_TYPES[typeKey];
            const cost = 15;
            
            const upgradeCard = document.createElement('div');
            upgradeCard.className = 'upgrade-card';
            upgradeCard.innerHTML = `
                <div class="upgrade-info">
                    <h3>${troop.emoji} Unlock ${troop.name}</h3>
                    <p>Recruit ${troop.name} troops</p>
                </div>
                <button class="upgrade-btn btn-primary" ${gameState.commandTokens < cost ? 'disabled' : ''}>
                    ${cost} 🎖️
                </button>
            `;
            
            if (gameState.commandTokens >= cost) {
                upgradeCard.querySelector('.upgrade-btn').addEventListener('click', () => {
                    if (confirm(`Unlock ${troop.name} for ${cost} Command Tokens?`)) {
                        gameState.commandTokens -= cost;
                        gameState.unlockedTroopTypes.push(typeKey);
                        saveGameState();
                        renderCamp();
                        render();
                    }
                });
            }
            
            upgradesList.appendChild(upgradeCard);
        });
    } else {
        upgradesList.innerHTML = '<p style="text-align: center; color: #666;">All troop types unlocked! 🎉</p>';
    }
}

function showUpgradeModal() {
    // Handled in handleSlotClick
}

// Rendering
function render() {
    // Update resources
    document.getElementById('strategic-points').textContent = gameState.strategicPoints;
    document.getElementById('command-tokens').textContent = gameState.commandTokens;
    document.getElementById('streak').textContent = gameState.streak;

    // Render activities
    const activitiesList = document.getElementById('activities-list');
    activitiesList.innerHTML = '';

    if (gameState.activities.length === 0) {
        activitiesList.innerHTML = '<p style="text-align: center; color: #666;">No activities yet. Add one to get started!</p>';
    } else {
        gameState.activities.forEach(activity => {
            const card = document.createElement('div');
            card.className = `activity-card ${activity.completed ? 'completed' : ''}`;
            card.innerHTML = `
                <div class="activity-info">
                    <div class="activity-name">${activity.name}</div>
                    <div class="activity-meta">
                        ${activity.category} • ${activity.frequency} • ${activity.effort} min
                    </div>
                </div>
                <div class="activity-actions">
                    <input type="checkbox" class="checkbox" ${activity.completed ? 'checked' : ''} 
                           onchange="toggleActivity(${activity.id})">
                </div>
            `;
            activitiesList.appendChild(card);
        });
    }

    // Re-render war table if active
    if (document.getElementById('war-table-tab').classList.contains('active')) {
        renderWarTable();
    }

    // Re-render camp if active
    if (document.getElementById('camp-tab').classList.contains('active')) {
        renderCamp();
    }
}

// Local Storage
function saveGameState() {
    localStorage.setItem('idleProductivityGame', JSON.stringify(gameState));
}

function loadGameState() {
    const saved = localStorage.getItem('idleProductivityGame');
    if (saved) {
        const loaded = JSON.parse(saved);
        Object.assign(gameState, loaded);
        
        // Ensure required properties exist
        if (!gameState.unlockedTroopTypes) {
            gameState.unlockedTroopTypes = ['infantry'];
        }
        if (!gameState.squadSlots || gameState.squadSlots.length === 0) {
            gameState.squadSlots = Array(9).fill(null).map((_, i) => ({
                id: i,
                unlocked: i === 0,
                platoon: null
            }));
        }
    }
}

// Make toggleActivity available globally
window.toggleActivity = toggleActivity;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
