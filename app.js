// app.js — complete with: inverted UFO bullet, sounds, level targets + mobile-only controls

// === PIXI App ===
const app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0b2233,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
});
document.body.appendChild(app.view);

// === Resize ===
function resizeCanvas() {
    app.renderer.resize(window.innerWidth, window.innerHeight);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// === Assets (make sure files exist) ===
const ASSETS = {
    rocket: "rocket.png",
    bullet: "bullet.png",        // player's bullet (shoots up)
    ufo1: "ufo1.png",
    ufo2: "ufo2.png",
    explosionSound: "explosion.mp3",
    hitSound: "hit.mp3",
    shootSound: "shoot.mp3"
};

// === Audio ===
const audio = {
    explosion: new Audio(ASSETS.explosionSound),
    hit: new Audio(ASSETS.hitSound),
    shoot: new Audio(ASSETS.shootSound)
};
// small helper to try play (ignore promise rejections)
function playSound(s) { try { s.currentTime = 0; s.play().catch(()=>{}); } catch(e){} }

// === Game Variables ===
let rocket = null;
let bullets = [], ufos = [], ufoBullets = [], explosions = [];
let keys = {}, gameRunning = false, ufoTimer = 0;

// Score & level system
let score = 0;
let levelIndex = 0; // 0 -> level1, 1->level2, 2->level3
const LEVELS = [
    { target: 30, durationSec: 60 },   // Level 1: 30 UFOs in 1 minute
    { target: 60, durationSec: 90 },   // Level 2: 60 UFOs in 1.5 minutes
    { target: 90, durationSec: 120 }   // Level 3: 90 UFOs in 2 minutes
];
let levelStartTime = 0; // timestamp ms

// UI texts
const ui = {
    scoreText: new PIXI.Text("", { fill: "white", fontSize: 20, fontWeight: "bold" }),
    levelText: new PIXI.Text("", { fill: "yellow", fontSize: 20, fontWeight: "bold" }),
    timerText: new PIXI.Text("", { fill: "lightgreen", fontSize: 20, fontWeight: "bold" }),
    messageText: new PIXI.Text("", { fill: "red", fontSize: 36, fontWeight: "bold" })
};

// place UI
ui.scoreText.x = 10; ui.scoreText.y = 10;
ui.levelText.x = 10; ui.levelText.y = 36;
// Place Time under Score and Level
ui.timerText.x = 10; ui.timerText.y = 62; ui.timerText.anchor = { x: 0, y: 0 };
ui.messageText.anchor = { x: 0.5, y: 0.5 };
ui.messageText.x = app.screen.width / 2; ui.messageText.y = 80;
app.stage.addChild(ui.scoreText, ui.levelText, ui.timerText, ui.messageText);

// === Helpers ===
function random(min, max) { return Math.floor(Math.random() * (max - min + 1) + min); }
function isMobile() { return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

// === Buttons (canvas) helper ===
function createButton(text, x, y, w, h, onClick) {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0x3333aa).drawRoundedRect(0, 0, w, h, 10).endFill();
    g.interactive = true; g.buttonMode = true;
    g.on("pointerdown", onClick);
    g.on("pointerover", () => g.alpha = 0.8);
    g.on("pointerout", () => g.alpha = 1);
    c.addChild(g);
    const t = new PIXI.Text(text, { fill: "white", fontSize: 20, fontWeight: "bold" });
    t.x = w / 2 - t.width / 2; t.y = h / 2 - t.height / 2;
    c.addChild(t);
    c.x = x; c.y = y;
    return c;
}

// === Rocket ===
function createRocket() {
    if (rocket && app.stage.children.includes(rocket)) app.stage.removeChild(rocket);
    rocket = PIXI.Sprite.from(ASSETS.rocket);
    rocket.anchor.set(0.5);
    rocket.x = app.screen.width / 2;
    rocket.y = app.screen.height - 100;
    rocket.scale.set(0.07);
    app.stage.addChild(rocket);
}

// === Player Bullet (shoots UP, orientation unchanged) ===
function shootBullet() {
    if (!gameRunning) return;
    if (!rocket) return;
    const b = PIXI.Sprite.from(ASSETS.bullet);
    b.anchor.set(0.5);
    b.x = rocket.x;
    b.y = rocket.y - rocket.height / 2;
    b.scale.set(0.05);
    // keep orientation as-is (shoot up)
    bullets.push(b);
    app.stage.addChild(b);
    playSound(audio.shoot);
}

// === UFO Bullet (shoot DOWN, but we want 'nose' pointing down) ===
function spawnUfoBullet(ufo) {
    const b = PIXI.Sprite.from(ASSETS.bullet);
    b.anchor.set(0.5);
    b.x = ufo.x;
    b.y = ufo.y + ufo.height / 2 + 6;
    b.scale.set(0.03);
    // flip vertically so that "nose" points down (visual only)
    b.scale.y *= -1;
    // NOTE: flipping scale.y makes sprite draw upside-down but movement will still be downwards
    ufoBullets.push(b);
    app.stage.addChild(b);
}

// === Explosion visual & sound ===
function explodeAt(x, y) {
    const g = new PIXI.Graphics();
    g.beginFill(0xff4444).drawCircle(0, 0, 12).endFill();
    g.x = x; g.y = y;
    app.stage.addChild(g);
    explosions.push({ sprite: g, life: 20 });
    playSound(audio.explosion);
}

// small hit feedback (smaller sound)
function hitFeedback(x, y) {
    const g = new PIXI.Graphics();
    g.beginFill(0xffff66).drawCircle(0, 0, 8).endFill();
    g.x = x; g.y = y;
    app.stage.addChild(g);
    explosions.push({ sprite: g, life: 10 });
    playSound(audio.hit);
}

// === UFO spawn ===
function spawnUFO() {
    const u = PIXI.Sprite.from(Math.random() < 0.5 ? ASSETS.ufo1 : ASSETS.ufo2);
    u.anchor.set(0.5);
    u.x = random(50, app.screen.width - 50);
    u.y = -40;
    u.scale.set(0.09);
    u.cooldown = random(60, 140);
    ufos.push(u);
    app.stage.addChild(u);
}

// === Collision ===
function isColliding(a, b) {
    if (!a || !b) return false;
    const A = a.getBounds(), B = b.getBounds();
    return A.x < B.x + B.width && A.x + A.width > B.x && A.y < B.y + B.height && A.y + A.height > B.y;
}

// === Game over/win UI ===
function endLevel(won) {
    gameRunning = false;
    // message
    ui.messageText.text = won ? `Success! Level ${levelIndex+1} complete` : `You lost! Didn't reach level ${levelIndex+1} target`;
    ui.messageText.x = app.screen.width/2;

    // create buttons
    const restartBtn = createButton("Restart (Level 1)", app.screen.width/2 - 220, app.screen.height/2 + 10, 200, 60, ()=> {
        // remove buttons if still on stage
        if (restartBtn.parent) app.stage.removeChild(restartBtn);
        if (nextBtn.parent) app.stage.removeChild(nextBtn);
        // Restart bringt das Spiel komplett auf Level 1 (index 0)
        resetGame(0);
    });

    const nextBtn = createButton(won ? (levelIndex < LEVELS.length-1 ? "Next" : "End Game") : "Retry", app.screen.width/2 + 20, app.screen.height/2 + 10, 200, 60, ()=> {
        if (restartBtn.parent) app.stage.removeChild(restartBtn);
        if (nextBtn.parent) app.stage.removeChild(nextBtn);
        if (won) {
            if (levelIndex < LEVELS.length-1) {
                levelIndex++;
                resetGame(levelIndex);
            } else {
                ui.messageText.text = "You completed all levels! Congratulations 🎉";
            }
        } else {
            // Retry: gleiche Stufe erneut
            resetGame(levelIndex);
        }
    });

    app.stage.addChild(restartBtn, nextBtn);
}

// === Reset Game (start specific level) ===
function resetGame(startLevel = 0) {
    // cleanup sprites
    [bullets, ufos, ufoBullets, explosions].forEach(arr => arr.forEach(obj => {
        const sprite = obj && obj.sprite ? obj.sprite : obj;
        if (sprite && sprite.parent) app.stage.removeChild(sprite);
    }));
    bullets = []; ufos = []; ufoBullets = []; explosions = [];
    keys = {};
    ufoTimer = 0;
    score = 0;
    levelIndex = Math.max(0, Math.min(startLevel, LEVELS.length-1));
    ui.messageText.text = "";
    ui.scoreText.text = `Score: ${score}`;
    ui.levelText.text = `Level: ${levelIndex+1} (Target ${LEVELS[levelIndex].target})`;
    startGame();
}

// === Start ===
function startGame() {
    gameRunning = true;
    createRocket();
    levelStartTime = performance.now();
    ui.scoreText.text = `Score: ${score}`;
    ui.levelText.text = `Level: ${levelIndex+1} (Target ${LEVELS[levelIndex].target})`;
}

// === Controls ===
document.addEventListener("keydown", e => keys[e.code] = true);
document.addEventListener("keyup", e => keys[e.code] = false);
document.addEventListener("keydown", e => { if (e.code === "Space") shootBullet(); });
app.view.addEventListener("pointerdown", (e) => {
    // on desktop click we shoot (keeps behaviour)
    if (!isMobile()) shootBullet();
});

// === Mobile on-screen controls (HTML buttons must exist in your HTML with ids) ===
function setupMobileControls() {
    const controlsDiv = document.getElementById("controls");
    if (!controlsDiv) return;
    if (isMobile()) {
        controlsDiv.style.display = "flex"; // show
        const left = document.getElementById("leftBtn");
        const right = document.getElementById("rightBtn");
        const up = document.getElementById("upBtn");
        const down = document.getElementById("downBtn");
        const fire = document.getElementById("fireBtn");
        left.ontouchstart = () => keys["ArrowLeft"] = true;
        left.ontouchend = () => keys["ArrowLeft"] = false;
        right.ontouchstart = () => keys["ArrowRight"] = true;
        right.ontouchend = () => keys["ArrowRight"] = false;
        up.ontouchstart = () => keys["ArrowUp"] = true;
        up.ontouchend = () => keys["ArrowUp"] = false;
        down.ontouchstart = () => keys["ArrowDown"] = true;
        down.ontouchend = () => keys["ArrowDown"] = false;
        fire.ontouchstart = (ev) => { ev.preventDefault(); shootBullet(); };
    } else {
        // hide on desktop (CSS also hides if width >= 768)
        controlsDiv.style.display = "none";
    }
}
setupMobileControls();

// === Start Button on Canvas ===
const startButton = createButton("Start Game", app.screen.width / 2 - 100, app.screen.height / 2 - 30, 200, 60, () => {
    if (startButton.parent) app.stage.removeChild(startButton);
    startGame();
});
app.stage.addChild(startButton);

// === Main Loop ===
app.ticker.add(() => {
    if (!gameRunning) return;

    // --- Movement: rocket ---
    if (!rocket) return;
    if (keys["ArrowLeft"] && rocket.x > 20) rocket.x -= 5;
    if (keys["ArrowRight"] && rocket.x < app.screen.width - 20) rocket.x += 5;
    if (keys["ArrowUp"] && rocket.y > 30) rocket.y -= 5;
    if (keys["ArrowDown"] && rocket.y < app.screen.height - 30) rocket.y += 5;

    // --- Player bullets go UP (orientation unchanged) ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.y -= 9;
        if (b.y < -10) { if (b.parent) app.stage.removeChild(b); bullets.splice(i, 1); continue; }
    }

    // --- UFO bullets go DOWN (but sprite is visually inverted to point nose down) ---
    for (let i = ufoBullets.length - 1; i >= 0; i--) {
        const b = ufoBullets[i];
        b.y += 5;
        if (b.y > app.screen.height + 10) { if (b.parent) app.stage.removeChild(b); ufoBullets.splice(i, 1); continue; }
        if (rocket && isColliding(b, rocket)) {
            // rocket hit
            explodeAt(rocket.x, rocket.y);
            playSound(audio.explosion);
            if (rocket.parent) app.stage.removeChild(rocket);
            gameRunning = false;
            endLevel(false); // lose immediately on rocket hit
            return;
        }
    }

    // --- UFOs move + shoot + collide with player's bullets ---
    for (let i = ufos.length - 1; i >= 0; i--) {
        const u = ufos[i];
        u.y += 2;
        u.cooldown--;
        if (u.cooldown <= 0) { spawnUfoBullet(u); u.cooldown = random(80, 140); }
        if (u.y > app.screen.height + 40) { if (u.parent) app.stage.removeChild(u); ufos.splice(i, 1); continue; }

        // bullets hitting UFO
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (isColliding(b, u)) {
                // hit
                hitFeedback(u.x, u.y);
                if (u.parent) app.stage.removeChild(u);
                if (b.parent) app.stage.removeChild(b);
                ufos.splice(i, 1);
                bullets.splice(j, 1);
                score++;
                ui.scoreText.text = `Score: ${score}`;
                break;
            }
        }

        // collision with rocket (body-to-body)
        if (rocket && isColliding(u, rocket)) {
            explodeAt(rocket.x, rocket.y);
            if (rocket.parent) app.stage.removeChild(rocket);
            gameRunning = false;
            endLevel(false);
            return;
        }
    }

    // --- Explosions animation ---
    for (let i = explosions.length - 1; i >= 0; i--) {
        const e = explosions[i];
        e.sprite.scale.x += 0.08;
        e.sprite.scale.y += 0.08;
        if (!e.sprite.alpha) e.sprite.alpha = 1;
        e.sprite.alpha -= 0.03;
        e.life--;
        if (e.life <= 0) { if (e.sprite.parent) app.stage.removeChild(e.sprite); explosions.splice(i, 1); }
    }

    // --- spawn UFOs periodically ---
    ufoTimer++;
    if (ufoTimer > 60) { spawnUFO(); ufoTimer = 0; }

    // --- Level timer check ---
    const elapsedMs = performance.now() - levelStartTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const level = LEVELS[levelIndex];
    const remaining = level.durationSec - elapsedSec;
    ui.timerText.text = `Time: ${remaining > 0 ? remaining : 0}s`;

    // update level label (in case)
    ui.levelText.text = `Level: ${levelIndex+1} (Target ${level.target})`;

    // Check win/lose by target
    if (score >= level.target) {
        // win this level
        endLevel(true);
        return;
    }
    if (remaining <= 0) {
        // time's up
        endLevel(score >= level.target);
        return;
    }
});

// optional: initialize mobile controls visibility right away
if (document.readyState === "complete" || document.readyState === "interactive") setupMobileControls();
else window.addEventListener("DOMContentLoaded", setupMobileControls);
