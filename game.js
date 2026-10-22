// =========================================================
// === ПУЛЬТ УПРАВЛЕНИЯ СПАВНОМ И ФЛОТОМ ===================
// =========================================================
const CONFIG = {
    startTorpedoes: 10, 
    crosshairHitY: 0.38, 
    directionRightChance: 0.5, // 0.5 = 50 на 50 плывут вправо/влево
    
    // БАЗОВАЯ СКОРОСТЬ планов
    speed: { 1: 0.5, 2: 1.2, 3: 2.5 },
    
    // ЧАСТОТА ПОЯВЛЕНИЯ (в миллисекундах)
    spawnDelay: {
        1: { min: 1000, max: 2500 }, 
        2: { min: 2000, max: 4000 }, 
        3: { min: 4000, max: 8000 }  
    },

    // СПИСОК КОРАБЛЕЙ (Массивы для случайного выбора)
    fleet: {
        // Дальний план (Мелкие)
        1: [
            { id: 'ship_smallUSA', scale: 0.4, speedMod: 1.0 },
            { id: 'ship_smallstels', scale: 0.4, speedMod: 1.3 } // Стелс плывет на 30% быстрее
        ],
        // Средний план
        2: [
            { id: 'ship_medium', scale: 0.7, speedMod: 1.0 },
            { id: 'ship_mediumUSA', scale: 0.7, speedMod: 0.9 },
            { id: 'ship_mediumstels', scale: 0.7, speedMod: 1.2 }
        ],
        // Ближний план
        3: [
            { id: 'ship_big', scale: 1.2, speedMod: 1.0 }
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
    if (state) state.horizonY = ch * 0.45; 
}
window.addEventListener('resize', resize);

let state = { torpedoes: CONFIG.startTorpedoes, score: 0, isGameOver: false, cameraX: 0, horizonY: 0, lightning: 0, flashOpacity: 0 };
resize(); 

const images = {};
function preloadImage(name, src) {
    images[name] = new Image();
    images[name].src = src;
}

// Загрузка эффектов и фона
preloadImage('bg', 'images/BG.png');
preloadImage('fx_hit', 'images/Explosion_02.png');
preloadImage('fx_miss', 'images/Water Splash.png');

// АВТОМАТИЧЕСКАЯ ЗАГРУЗКА ВСЕХ КОРАБЛЕЙ ИЗ CONFIG
for (let depth in CONFIG.fleet) {
    CONFIG.fleet[depth].forEach(shipParams => {
        preloadImage(shipParams.id, `images/${shipParams.id}.png`);
        preloadImage(shipParams.id + 'R', `images/${shipParams.id}R.png`); // Загружаем отзеркаленную версию
    });
}

let ships = [];

function spawnShip(depthType) {
    let yPos, baseSpeed;
    
    if (depthType === 1) { 
        yPos = state.horizonY - 10; baseSpeed = CONFIG.speed[1];
    } else if (depthType === 2) { 
        yPos = state.horizonY + 30; baseSpeed = CONFIG.speed[2];
    } else { 
        yPos = state.horizonY + 80; baseSpeed = CONFIG.speed[3];
    }
    
    // Выбираем случайный корабль из списка доступных для этого плана
    let fleetOptions = CONFIG.fleet[depthType];
    let chosenShip = fleetOptions[Math.floor(Math.random() * fleetOptions.length)];
    
    let direction = Math.random() < CONFIG.directionRightChance ? 1 : -1;
    let xPos = state.cameraX + (direction === 1 ? -800 : cw + 800);
    
    let imgLeft = images[chosenShip.id];
    let imgRight = images[chosenShip.id + 'R'];
    let activeImage = (direction === 1) ? imgRight : imgLeft;
    
    // Применяем индивидуальный множитель скорости корабля
    let finalSpeed = baseSpeed * chosenShip.speedMod * direction;

    ships.push({ 
        x: xPos, y: yPos, baseHeight: 50, depth: depthType,
        speed: finalSpeed, scale: chosenShip.scale, img: activeImage, 
        active: true, hitWidth: 100 
    });
}

spawnShip(1); spawnShip(2); spawnShip(3);

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
        let screenX = s.x - state.cameraX;
        
        // Отрисовка
        if (s.img && s.img.complete && s.img.naturalWidth > 0) {
            let ratio = s.img.naturalWidth / s.img.naturalHeight;
            let drawHeight = s.baseHeight * s.scale;
            let drawWidth = drawHeight * ratio;
            s.hitWidth = drawWidth; 
            ctx.drawImage(s.img, screenX, s.y - drawHeight + bobbingY, drawWidth, drawHeight);
        }
        
        if (s.x > state.cameraX + 2500 || s.x < state.cameraX - 2500) {
            s.active = false;
            let dType = s.depth;
            let nextSpawnDelay = Math.random() * (CONFIG.spawnDelay[dType].max - CONFIG.spawnDelay[dType].min) + CONFIG.spawnDelay[dType].min;
            setTimeout(() => spawnShip(dType), nextSpawnDelay);
        }
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
            
            s.active = false;
            let dType = s.depth;
            setTimeout(() => spawnShip(dType), 1000); 
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