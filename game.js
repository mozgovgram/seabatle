// =========================================================
// === ПУЛЬТ УПРАВЛЕНИЯ СПАВНОМ И ФЛОТОМ ===================
// =========================================================
const CONFIG = {
    startTorpedoes: 10, 
    crosshairHitY: 0.38, 
    
    // Оптимальная скорость для комфортной стрельбы
    speed: { 1: 0.8, 2: 1.2, 3: 1.6 },
    
    // Пауза перед выходом следующего корабля, когда полоса освободилась
    spawnDelay: {
        1: { min: 1000, max: 3000 }, 
        2: { min: 1500, max: 4000 }, 
        3: { min: 2000, max: 5000 }  
    },

    fleet: {
        // Дальняя полоса
        1: [
            { id: 'ship_small', scale: 0.8, speedMod: 1.2, yOffset: 0 },
            { id: 'ship_smallstelsR', scale: 0.8, speedMod: 1.2, yOffset: 0 }
        ],
        // Средняя полоса
        2: [
            { id: 'ship_medium', scale: 1.2, speedMod: 1.0, yOffset: 15 },
            { id: 'ship_mediumstels', scale: 1.2, speedMod: 1.1, yOffset: 15 },
            { id: 'ship_mediumstelsR', scale: 1.2, speedMod: 1.1, yOffset: 15 },
            { id: 'ship_mediumUSA', scale: 1.4, speedMod: 0.9, yOffset: 20 },
            { id: 'ship_mediumUSAR', scale: 1.4, speedMod: 0.9, yOffset: 20 }
        ],
        // Ближняя полоса
        3: [
            { id: 'ship_big', scale: 1.6, speedMod: 1.0, yOffset: 25 },
            { id: 'ship_bigR', scale: 1.6, speedMod: 1.0, yOffset: 25 },
            { id: 'ship_bigUSA', scale: 1.8, speedMod: 0.9, yOffset: 35 },
            { id: 'ship_bigUSAR', scale: 1.8, speedMod: 0.9, yOffset: 35 }
        ]
    }
};
// =========================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const torpedoCounterEl = document.getElementById('torpedo-counter');
const scoreCounterEl = document.getElementById('score-counter');
const fireBtn = document.getElementById('fire-btn');

const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreText = document.getElementById('final-score-text');

const sndBg = document.getElementById('snd-bg');
const sndFire = document.getElementById('snd-fire');
const sndHit = document.getElementById('snd-hit');
const sndMiss = document.getElementById('snd-miss');

if (sndBg) sndBg.volume = 0.01;
if (sndFire) sndFire.volume = 0.8;
if (sndHit) sndHit.volume = 1.0;
if (sndMiss) sndMiss.volume = 0.7;

let isGameStarted = false;
// Состояние: храним ID последних кораблей для анти-повтора
let state = { 
    torpedoes: CONFIG.startTorpedoes, 
    score: 0, 
    isGameOver: false, 
    cameraX: 0, 
    horizonY: 0, 
    lightning: 0, 
    flashOpacity: 0,
    lastShipId: { 1: null, 2: null, 3: null }
};

document.getElementById('start-btn').addEventListener('click', () => {
    startScreen.style.display = 'none';
    isGameStarted = true;
    if (sndBg) sndBg.play().catch(e => console.log("Автоплей заблокирован:", e));
});

document.getElementById('pay-btn').addEventListener('click', () => {
    state.torpedoes = CONFIG.startTorpedoes;
    state.isGameOver = false;
    fireBtn.disabled = false;
    updateCounters();
    gameOverScreen.style.display = 'none';
    if (sndBg) sndBg.play();
});

let cw, ch;
function resize() {
    cw = canvas.width = window.innerWidth > 600 ? 600 : window.innerWidth;
    ch = canvas.height = window.innerHeight;
    state.horizonY = ch * 0.45; 
}
window.addEventListener('resize', resize);
resize(); 

const images = {};
function preloadImage(name, src) {
    images[name] = new Image();
    images[name].src = src;
}

preloadImage('bg', 'images/BG.png');
preloadImage('fx_hit', 'images/Explosion_02.png');
preloadImage('fx_miss', 'images/Water Splash.png');

for (let depth in CONFIG.fleet) {
    CONFIG.fleet[depth].forEach(shipParams => {
        preloadImage(shipParams.id, `images/${shipParams.id}.png`);
    });
}

let ships = [];

function spawnShip(depthType) {
    let yBase, baseSpeed, bHeight;
    
    if (depthType === 1) { 
        yBase = state.horizonY + 15; 
        baseSpeed = CONFIG.speed[1];
        bHeight = 40; 
    } else if (depthType === 2) { 
        yBase = state.horizonY + 50; 
        baseSpeed = CONFIG.speed[2];
        bHeight = 70; 
    } else { 
        yBase = state.horizonY + 95; 
        baseSpeed = CONFIG.speed[3];
        bHeight = 110; 
    }
    
    let fleetOptions = CONFIG.fleet[depthType];
    
    // АНТИ-КСЕРОКС: Убираем из выбора тот корабль, который был на полосе только что
    let availableShips = fleetOptions.filter(s => s.id !== state.lastShipId[depthType]);
    if (availableShips.length === 0) availableShips = fleetOptions; // Защита, если в массиве всего 1 корабль
    
    let chosenShip = availableShips[Math.floor(Math.random() * availableShips.length)];
    state.lastShipId[depthType] = chosenShip.id; // Запоминаем выбор
    
    let isRightFacing = chosenShip.id.endsWith('R');
    let direction = isRightFacing ? 1 : -1; 
    
    // Спавним аккурат за краем экрана (а не за километры)
    let xPos = state.cameraX + (direction === 1 ? -300 : cw + 300);
    let activeImage = images[chosenShip.id];
    
    if (!activeImage || !activeImage.complete || activeImage.naturalWidth === 0) {
        return; // Если картинки нет, менеджер полосы сам вызовет спавн снова
    }

    let finalSpeed = baseSpeed * chosenShip.speedMod * direction;
    let finalY = yBase + (chosenShip.yOffset || 0);

    ships.push({ 
        x: xPos, y: finalY, baseHeight: bHeight, depth: depthType,
        speed: finalSpeed, scale: chosenShip.scale, img: activeImage, 
        active: true, hitWidth: 100 
    });
}

// УМНЫЙ МЕНЕДЖЕР ПОЛОС: Строго 1 корабль на линию!
function startLaneManager(depth) {
    function checkAndSpawn() {
        if (!isGameStarted || state.isGameOver) {
            setTimeout(checkAndSpawn, 1000); 
            return;
        }
        
        // Считаем, сколько сейчас кораблей на этой глубине
        let shipsOnLane = ships.filter(s => s.depth == depth && s.active);
        
        if (shipsOnLane.length === 0) {
            // Полоса свободна! Ждем паузу и выпускаем новый корабль
            let delay = Math.random() * (CONFIG.spawnDelay[depth].max - CONFIG.spawnDelay[depth].min) + CONFIG.spawnDelay[depth].min;
            setTimeout(() => {
                if (isGameStarted && !state.isGameOver) spawnShip(depth);
                setTimeout(checkAndSpawn, 500); // Продолжаем следить за полосой
            }, delay);
        } else {
            // Полоса занята. Проверим еще раз через полсекунды
            setTimeout(checkAndSpawn, 500);
        }
    }
    // Рассинхронизируем старт, чтобы они не выехали одновременно
    setTimeout(checkAndSpawn, Math.random() * 2000 + (depth * 500));
}

// Запускаем контроль для каждой из 3 линий
startLaneManager(1);
startLaneManager(2);
startLaneManager(3);

let torpedo = null;
let fxQueue = []; 

let isDragging = false, startDragX = 0;
canvas.addEventListener('touchstart', e => { if(isGameStarted && !state.isGameOver){ isDragging = true; startDragX = e.touches[0].clientX; }});
canvas.addEventListener('touchmove', e => {
    if (!isDragging) return;
    state.cameraX -= (e.touches[0].clientX - startDragX) * 1.5; 
    startDragX = e.touches[0].clientX;
});
canvas.addEventListener('touchend', () => { isDragging = false; });
canvas.addEventListener('mousedown', e => { if(isGameStarted && !state.isGameOver){ isDragging = true; startDragX = e.clientX; }});
window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    state.cameraX -= (e.clientX - startDragX) * 1.5;
    startDragX = e.clientX;
});
window.addEventListener('mouseup', () => { isDragging = false; });

fireBtn.addEventListener('click', () => {
    if (!isGameStarted || state.isGameOver) return;
    
    if (state.torpedoes > 0 && !torpedo) {
        state.torpedoes--;
        updateCounters();
        torpedo = { screenX: cw / 2, screenY: ch, progress: 0 };
        
        if (sndFire) {
            sndFire.currentTime = 0;
            sndFire.play();
        }
    }
});

function updateCounters() {
    torpedoCounterEl.innerText = state.torpedoes.toString().padStart(2, '0');
    scoreCounterEl.innerText = state.score.toString().padStart(2, '0');
    
    if (state.torpedoes === 0 && !torpedo) triggerGameOver();
}

function triggerGameOver() {
    state.isGameOver = true;
    fireBtn.disabled = true;
    
    if (sndBg) sndBg.pause();
    
    setTimeout(() => {
        finalScoreText.innerText = state.score;
        gameOverScreen.style.display = 'flex';
    }, 1000);
}

function drawClouds() {
    let cloudOffset = (Date.now() * 0.05 + state.cameraX * 0.2) % (cw * 2);
    ctx.globalAlpha = 0.5;
    for(let i=0; i<3; i++) {
        let x = (cloudOffset + i * 300) % (cw * 2) - 200;
        let y = 50 + Math.sin(Date.now()*0.001 + i) * 20;
        let radGrad = ctx.createRadialGradient(x, y, 10, x, y, 150);
        radGrad.addColorStop(0, 'rgba(40, 50, 70, 0.8)');
        radGrad.addColorStop(1, 'rgba(40, 50, 70, 0)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(x, y, 150, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

function drawLightningBranches() {
    if (state.lightning <= 0) return;
    
    ctx.strokeStyle = `rgba(200, 230, 255, ${state.lightning / 20})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let startX = (Math.random() * cw) + (state.cameraX % 100);
    let startY = 0;
    ctx.moveTo(startX, startY);
    
    for(let i=0; i<5; i++) {
        startX += (Math.random() - 0.5) * 100;
        startY += (Math.random() * 50) + 20;
        ctx.lineTo(startX, startY);
        
        if (Math.random() > 0.5) {
            let branchX = startX + (Math.random() - 0.5) * 50;
            let branchY = startY + (Math.random() * 30) + 10;
            ctx.moveTo(startX, startY);
            ctx.lineTo(branchX, branchY);
            ctx.moveTo(startX, startY); 
        }
    }
    ctx.stroke();
}

function gameLoop() {
    if (!isGameStarted) { requestAnimationFrame(gameLoop); return; }

    ctx.clearRect(0, 0, cw, ch);
    let bobbingY = Math.sin(Date.now() / 800) * 8; 
    
    if (Math.random() < 0.001) {
        state.lightning = 20; 
        state.flashOpacity = 0.8; 
    }
    if (state.lightning > 0) state.lightning--;
    if (state.flashOpacity > 0) state.flashOpacity -= 0.05;

    if (images.bg && images.bg.complete && images.bg.naturalWidth > 0) {
        let bgW = images.bg.naturalWidth;
        let bgH = images.bg.naturalHeight;
        let drawH = ch + 60; 
        let drawW = (bgW / bgH) * drawH; 
        let doubleW = drawW * 2;
        let startY = state.horizonY - (drawH / 2) + bobbingY;
        let timeScroll = Date.now() * 0.05;

        let slices = [
            { yRatio: 0,    hRatio: 0.5,  camSpeed: 0.1, autoSpeed: 0.5 }, 
            { yRatio: 0.5,  hRatio: 0.15, camSpeed: 0.3, autoSpeed: 0.4 },  
            { yRatio: 0.65, hRatio: 0.15, camSpeed: 0.6, autoSpeed: 1.0 },  
            { yRatio: 0.8,  hRatio: 0.2,  camSpeed: 1.0, autoSpeed: 2.5 }   
        ];

        slices.forEach(slice => {
            let srcY = slice.yRatio * bgH, srcH = slice.hRatio * bgH;
            let destY = startY + (slice.yRatio * drawH), destH = slice.hRatio * drawH;
            let layerMovement = (state.cameraX * slice.camSpeed) + (timeScroll * slice.autoSpeed);
            let offset = -(layerMovement % doubleW);
            if (offset > 0) offset -= doubleW;

            for (let i = 0; i < 4; i++) {
                let currentX = offset + (i * drawW);
                ctx.save();
                if (i % 2 !== 0) {
                    ctx.translate(currentX + drawW, destY);
                    ctx.scale(-1, 1);
                    ctx.drawImage(images.bg, 0, srcY, bgW, srcH, 0, 0, drawW, destH);
                } else {
                    ctx.drawImage(images.bg, 0, srcY, bgW, srcH, currentX, destY, drawW, destH);
                }
                ctx.restore();
            }
        });
    } else {
        ctx.fillStyle = '#1c2430'; ctx.fillRect(0, 0, cw, state.horizonY + bobbingY);
        ctx.fillStyle = '#0f1722'; ctx.fillRect(0, state.horizonY + bobbingY, cw, ch);
    }

    drawClouds();
    drawLightningBranches();
    
    if (state.flashOpacity > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.flashOpacity})`;
        ctx.fillRect(0, 0, cw, state.horizonY + bobbingY);
    }

    for (let i = 0; i < ships.length; i++) {
        let s = ships[i];
        if (!s.active) continue;
        s.x += s.speed;
        let screenX = s.x - state.cameraX; // Положение относительно экрана (0 - это левый край)
        
        if (s.img && s.img.complete && s.img.naturalWidth > 0) {
            let ratio = s.img.naturalWidth / s.img.naturalHeight;
            let drawHeight = s.baseHeight * s.scale;
            let drawWidth = drawHeight * ratio;
            s.hitWidth = drawWidth; 
            
            ctx.drawImage(s.img, screenX, s.y - drawHeight + bobbingY, drawWidth, drawHeight);
        }
        
        // ТОЧНОЕ И БЫСТРОЕ УДАЛЕНИЕ: 
        // Удаляем корабль, как только он отплыл на 300px от края экрана
        if (s.speed > 0 && screenX > cw + 300) s.active = false;
        if (s.speed < 0 && screenX < -300 - s.hitWidth) s.active = false;
    }
    
    ships = ships.filter(s => s.active);

    if (torpedo) {
        torpedo.progress += 0.015; 
        let targetY = state.horizonY + bobbingY;
        let currentY = ch - (ch - targetY) * torpedo.progress;
        let scale = 1 - torpedo.progress;
        
        ctx.save();
        ctx.beginPath(); ctx.rect(0, targetY, cw, ch - targetY); ctx.clip(); 
        
        ctx.beginPath();
        ctx.setLineDash([10 * scale, 15 * scale]); 
        ctx.moveTo(cw / 2, ch); ctx.lineTo(torpedo.screenX, currentY); 
        ctx.lineWidth = Math.max(1, 3 * scale);
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'; ctx.stroke();
        ctx.setLineDash([]); 
        
        ctx.beginPath();
        ctx.arc(torpedo.screenX, currentY, Math.max(0, 5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 0, 1)'; ctx.fill();
        ctx.restore();

        if (torpedo.progress >= 1) {
            checkHit();
            torpedo = null;
            if (state.torpedoes === 0) updateCounters(); 
        }
    }

    for (let i = fxQueue.length - 1; i >= 0; i--) {
        let fx = fxQueue[i];
        if (fx.img && fx.img.complete && fx.img.naturalHeight > 0) {
            let frameH = fx.img.naturalHeight, frameW = frameH; 
            let totalFrames = Math.floor(fx.img.naturalWidth / frameW);
            let drawW = frameW * fx.scale, drawH = frameH * fx.scale;
            
            ctx.drawImage(fx.img, fx.frame * frameW, 0, frameW, frameH, fx.x - state.cameraX - drawW/2, fx.y + bobbingY - drawH/2, drawW, drawH);
            if (++fx.timer % 3 === 0) fx.frame++;
            if (fx.frame >= totalFrames) fxQueue.splice(i, 1);
        } else fxQueue.splice(i, 1); 
    }

    requestAnimationFrame(gameLoop);
}

function checkHit() {
    let targetX = state.cameraX + (cw / 2);
    let hit = false;
    
    for (let i = 0; i < ships.length; i++) {
        let s = ships[i];
        if (targetX >= s.x && targetX <= s.x + s.hitWidth) {
            state.score++; updateCounters();
            
            if (sndHit) {
                sndHit.currentTime = 0;
                sndHit.play();
            }
            
            fxQueue.push({ x: s.x + s.hitWidth/2, y: s.y - (s.baseHeight * s.scale)/2, img: images.fx_hit, frame: 0, timer: 0, scale: s.scale * 1.5 });
            
            document.getElementById('game-container').style.transform = 'translate(5px, 5px)';
            setTimeout(() => document.getElementById('game-container').style.transform = 'none', 50);
            
            s.active = false; // При попадании корабль тут же удаляется, полоса освобождается
            hit = true; break;
        }
    }
    
    if (!hit) {
        if (sndMiss) {
            sndMiss.currentTime = 0;
            sndMiss.play();
        }
        fxQueue.push({ x: targetX, y: state.horizonY, img: images.fx_miss, frame: 0, timer: 0, scale: 0.8 });
    }
}

gameLoop();