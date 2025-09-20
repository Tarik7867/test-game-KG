import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Button } from '@/components/ui/button';

interface GameObject {
  sprite: PIXI.Graphics;
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy?: number;
}

interface Boss extends GameObject {
  hp: number;
  maxHp: number;
  lastShot: number;
  movingRight: boolean;
  moveStartTime: number;
}

type GameState = 'menu' | 'level1' | 'level2' | 'win' | 'lose';

export const SpaceShooterGame = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const gameStateRef = useRef<{
    player: GameObject | null;
    bullets: GameObject[];
    asteroids: GameObject[];
    boss: Boss | null;
    bossBullets: GameObject[];
    keys: { [key: string]: boolean };
    bulletsRemaining: number;
    timeRemaining: number;
    gameState: GameState;
    lastTime: number;
  }>({
    player: null,
    bullets: [],
    asteroids: [],
    boss: null,
    bossBullets: [],
    keys: {},
    bulletsRemaining: 10,
    timeRemaining: 60,
    gameState: 'menu',
    lastTime: 0,
  });

  const [gameInfo, setGameInfo] = useState({
    bullets: 10,
    time: 60,
    state: 'menu' as GameState,
    bossHp: 0,
    bossMaxHp: 4,
  });

  const createPlayer = (app: PIXI.Application): GameObject => {
    const graphics = new PIXI.Graphics();
    
    // Create rocket ship like in the reference image
    graphics.fill(0xFFAA00); // Yellow body
    graphics.drawPolygon([
      0, -20,  // Top point
      -15, 20, // Bottom left
      0, 10,   // Bottom center
      15, 20   // Bottom right
    ]);
    
    // Blue accents
    graphics.fill(0x4A90E2);
    graphics.drawPolygon([
      -10, 20,
      -5, 30,
      5, 30,
      10, 20
    ]);
    
    graphics.x = app.screen.width / 2;
    graphics.y = app.screen.height - 60;
    
    app.stage.addChild(graphics);
    
    return {
      sprite: graphics,
      x: graphics.x,
      y: graphics.y,
      width: 30,
      height: 40
    };
  };

  const createBullet = (app: PIXI.Application, x: number, y: number, isPlayerBullet = true): GameObject => {
    const graphics = new PIXI.Graphics();
    graphics.fill(isPlayerBullet ? 0x00FFFF : 0xFF4444); // Cyan for player, red for boss
    graphics.drawCircle(0, 0, 3);
    graphics.x = x;
    graphics.y = y;
    
    app.stage.addChild(graphics);
    
    return {
      sprite: graphics,
      x: graphics.x,
      y: graphics.y,
      width: 6,
      height: 6,
      vy: isPlayerBullet ? -8 : 6
    };
  };

  const createAsteroid = (app: PIXI.Application, x: number, y: number): GameObject => {
    const graphics = new PIXI.Graphics();
    graphics.fill(0xAA3333); // Dark red like in reference
    
    // Create irregular asteroid shape
    const points: number[] = [];
    const sides = 8;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const radius = 20 + Math.random() * 15;
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    graphics.drawPolygon(points);
    
    // Add some texture lines
    graphics.stroke({ width: 2, color: 0x773333 });
    for (let i = 0; i < 5; i++) {
      const startAngle = Math.random() * Math.PI * 2;
      const endAngle = startAngle + Math.random() * Math.PI;
      const startRadius = Math.random() * 20;
      const endRadius = Math.random() * 20;
      graphics.moveTo(Math.cos(startAngle) * startRadius, Math.sin(startAngle) * startRadius);
      graphics.lineTo(Math.cos(endAngle) * endRadius, Math.sin(endAngle) * endRadius);
    }
    
    graphics.x = x;
    graphics.y = y;
    app.stage.addChild(graphics);
    
    return {
      sprite: graphics,
      x: graphics.x,
      y: graphics.y,
      width: 60,
      height: 60
    };
  };

  const createBoss = (app: PIXI.Application): Boss => {
    const graphics = new PIXI.Graphics();
    
    // Main body - larger, more menacing
    graphics.fill(0x660000); // Dark red
    graphics.drawRect(-40, -30, 80, 60);
    
    // Details
    graphics.fill(0xFF0000); // Bright red accents
    graphics.drawCircle(-20, -10, 8);
    graphics.drawCircle(20, -10, 8);
    graphics.drawCircle(0, 0, 12);
    
    // Weapons
    graphics.fill(0x333333);
    graphics.drawRect(-5, 30, 10, 20);
    
    graphics.x = app.screen.width / 2;
    graphics.y = 100;
    app.stage.addChild(graphics);
    
    return {
      sprite: graphics,
      x: graphics.x,
      y: graphics.y,
      width: 80,
      height: 60,
      hp: 4,
      maxHp: 4,
      lastShot: 0,
      movingRight: true,
      moveStartTime: Date.now()
    };
  };

  const createBackground = (app: PIXI.Application) => {
    // Clear and create space background
    app.stage.removeChildren();
    
    // Add stars
    for (let i = 0; i < 200; i++) {
      const star = new PIXI.Graphics();
      const brightness = Math.random();
      const color = brightness > 0.8 ? 0xFFFFFF : brightness > 0.6 ? 0xCCCCFF : 0x888888;
      star.fill(color);
      star.drawCircle(0, 0, Math.random() * 2 + 0.5);
      star.x = Math.random() * app.screen.width;
      star.y = Math.random() * app.screen.height;
      app.stage.addChild(star);
    }
  };

  const checkCollision = (obj1: GameObject, obj2: GameObject): boolean => {
    // Objects are center-anchored, so we need to calculate actual bounds
    const obj1Left = obj1.x - obj1.width / 2;
    const obj1Right = obj1.x + obj1.width / 2;
    const obj1Top = obj1.y - obj1.height / 2;
    const obj1Bottom = obj1.y + obj1.height / 2;
    
    const obj2Left = obj2.x - obj2.width / 2;
    const obj2Right = obj2.x + obj2.width / 2;
    const obj2Top = obj2.y - obj2.height / 2;
    const obj2Bottom = obj2.y + obj2.height / 2;
    
    return obj1Left < obj2Right &&
           obj1Right > obj2Left &&
           obj1Top < obj2Bottom &&
           obj1Bottom > obj2Top;
  };

  const showMessage = (app: PIXI.Application, text: string, color: number = 0x00FFFF) => {
    const message = new PIXI.Text({
      text,
      style: {
        fontSize: 48,
        fill: color,
        fontFamily: 'Courier New',
        stroke: { color: 0x000000, width: 3 }
      }
    });
    message.anchor.set(0.5);
    message.x = app.screen.width / 2;
    message.y = app.screen.height / 2;
    app.stage.addChild(message);
  };

  const startLevel1 = () => {
    if (!appRef.current) return;
    
    const app = appRef.current;
    const gameState = gameStateRef.current;
    
    createBackground(app);
    
    // Create player
    gameState.player = createPlayer(app);
    
    // Create asteroids
    gameState.asteroids = [];
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * (app.screen.width - 60) + 30;
      const y = Math.random() * 300 + 50;
      gameState.asteroids.push(createAsteroid(app, x, y));
    }
    
    // Reset game state
    gameState.bullets = [];
    gameState.bulletsRemaining = 10;
    gameState.timeRemaining = 60;
    gameState.gameState = 'level1';
    gameState.lastTime = Date.now();
    
    setGameInfo(prev => ({ ...prev, bullets: 10, time: 60, state: 'level1' }));
  };

  const startLevel2 = () => {
    if (!appRef.current) return;
    
    const app = appRef.current;
    const gameState = gameStateRef.current;
    
    createBackground(app);
    
    // Create player
    gameState.player = createPlayer(app);
    
    // Create boss
    gameState.boss = createBoss(app);
    gameState.bossBullets = [];
    
    // Reset game state
    gameState.bullets = [];
    gameState.bulletsRemaining = 10;
    gameState.timeRemaining = 60;
    gameState.gameState = 'level2';
    gameState.lastTime = Date.now();
    
    setGameInfo(prev => ({ 
      ...prev, 
      bullets: 10, 
      time: 60, 
      state: 'level2',
      bossHp: 4,
      bossMaxHp: 4
    }));
  };

  const gameLoop = () => {
    if (!appRef.current) return;
    
    const app = appRef.current;
    const gameState = gameStateRef.current;
    const currentTime = Date.now();
    
    if (gameState.gameState === 'menu' || gameState.gameState === 'win' || gameState.gameState === 'lose') {
      return;
    }
    
    // Update timer
    const deltaTime = (currentTime - gameState.lastTime) / 1000;
    gameState.timeRemaining -= deltaTime;
    gameState.lastTime = currentTime;
    
    if (gameState.timeRemaining <= 0) {
      gameState.gameState = 'lose';
      createBackground(app);
      showMessage(app, 'YOU LOSE', 0xFF4444);
      setGameInfo(prev => ({ ...prev, state: 'lose', time: 0 }));
      return;
    }
    
    setGameInfo(prev => ({ ...prev, time: Math.max(0, Math.ceil(gameState.timeRemaining)) }));
    
    // Player movement
    if (gameState.player) {
      if (gameState.keys['ArrowLeft'] && gameState.player.x > 15) {
        gameState.player.x -= 5;
        gameState.player.sprite.x = gameState.player.x;
      }
      if (gameState.keys['ArrowRight'] && gameState.player.x < app.screen.width - 15) {
        gameState.player.x += 5;
        gameState.player.sprite.x = gameState.player.x;
      }
    }
    
    // Update bullets
    gameState.bullets.forEach((bullet, index) => {
      bullet.y += bullet.vy!;
      bullet.sprite.y = bullet.y;
      
      if (bullet.y < 0) {
        app.stage.removeChild(bullet.sprite);
        gameState.bullets.splice(index, 1);
      }
    });
    
    // Level 1 logic
    if (gameState.gameState === 'level1') {
      // Check bullet-asteroid collisions (iterate backwards to avoid index issues)
      for (let bulletIndex = gameState.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
        const bullet = gameState.bullets[bulletIndex];
        for (let asteroidIndex = gameState.asteroids.length - 1; asteroidIndex >= 0; asteroidIndex--) {
          const asteroid = gameState.asteroids[asteroidIndex];
          if (checkCollision(bullet, asteroid)) {
            app.stage.removeChild(bullet.sprite);
            app.stage.removeChild(asteroid.sprite);
            gameState.bullets.splice(bulletIndex, 1);
            gameState.asteroids.splice(asteroidIndex, 1);
            break; // bullet is destroyed, move to next bullet
          }
        }
      }
      
      // Check win condition
      if (gameState.asteroids.length === 0) {
        startLevel2();
        return;
      }
      
      // Check lose condition
      if (gameState.bulletsRemaining === 0 && gameState.bullets.length === 0) {
        gameState.gameState = 'lose';
        createBackground(app);
        showMessage(app, 'YOU LOSE', 0xFF4444);
        setGameInfo(prev => ({ ...prev, state: 'lose' }));
        return;
      }
    }
    
    // Level 2 logic
    if (gameState.gameState === 'level2' && gameState.boss) {
      // Boss movement
      const movePhase = Math.floor((currentTime - gameState.boss.moveStartTime) / 3000) % 2;
      if (movePhase === 1) { // Moving phase
        if (gameState.boss.movingRight) {
          gameState.boss.x += 2;
          if (gameState.boss.x > app.screen.width - 40) {
            gameState.boss.movingRight = false;
          }
        } else {
          gameState.boss.x -= 2;
          if (gameState.boss.x < 40) {
            gameState.boss.movingRight = true;
          }
        }
        gameState.boss.sprite.x = gameState.boss.x;
      }
      
      // Boss shooting
      if (currentTime - gameState.boss.lastShot > 2000) {
        const bossBullet = createBullet(app, gameState.boss.x, gameState.boss.y + 30, false);
        gameState.bossBullets.push(bossBullet);
        gameState.boss.lastShot = currentTime;
      }
      
      // Update boss bullets
      gameState.bossBullets.forEach((bullet, index) => {
        bullet.y += bullet.vy!;
        bullet.sprite.y = bullet.y;
        
        if (bullet.y > app.screen.height) {
          app.stage.removeChild(bullet.sprite);
          gameState.bossBullets.splice(index, 1);
        }
        
        // Check collision with player
        if (gameState.player && checkCollision(bullet, gameState.player)) {
          gameState.gameState = 'lose';
          createBackground(app);
          showMessage(app, 'YOU LOSE', 0xFF4444);
          setGameInfo(prev => ({ ...prev, state: 'lose' }));
          return;
        }
        
        // Check collision with player bullets
        gameState.bullets.forEach((playerBullet, playerBulletIndex) => {
          if (checkCollision(bullet, playerBullet)) {
            app.stage.removeChild(bullet.sprite);
            app.stage.removeChild(playerBullet.sprite);
            gameState.bossBullets.splice(index, 1);
            gameState.bullets.splice(playerBulletIndex, 1);
          }
        });
      });
      
      // Check collision between player and boss (with some tolerance to avoid immediate collision)
      if (gameState.player && gameState.boss) {
        const distance = Math.abs(gameState.player.x - gameState.boss.x) + Math.abs(gameState.player.y - gameState.boss.y);
        if (distance < 50) { // Only check collision if objects are close
          if (checkCollision(gameState.player, gameState.boss)) {
            gameState.gameState = 'lose';
            createBackground(app);
            showMessage(app, 'YOU LOSE', 0xFF4444);
            setGameInfo(prev => ({ ...prev, state: 'lose' }));
            return;
          }
        }
      }
      
      // Check player bullet-boss collisions
      for (let bulletIndex = gameState.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
        const bullet = gameState.bullets[bulletIndex];
        if (checkCollision(bullet, gameState.boss)) {
          app.stage.removeChild(bullet.sprite);
          gameState.bullets.splice(bulletIndex, 1);
          gameState.boss.hp--;
          setGameInfo(prev => ({ ...prev, bossHp: gameState.boss.hp }));
          
          if (gameState.boss.hp === 0) {
            gameState.gameState = 'win';
            createBackground(app);
            showMessage(app, 'YOU WIN', 0x00FF00);
            setGameInfo(prev => ({ ...prev, state: 'win' }));
            return;
          }
        }
      }
      
      // Check lose condition
      if (gameState.bulletsRemaining === 0 && gameState.bullets.length === 0) {
        gameState.gameState = 'lose';
        createBackground(app);
        showMessage(app, 'YOU LOSE', 0xFF4444);
        setGameInfo(prev => ({ ...prev, state: 'lose' }));
        return;
      }
    }
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new PIXI.Application();
    
    app.init({
      width: 1280,
      height: 720,
      backgroundColor: 0x0a0a1a,
      antialias: true,
    }).then(() => {
      if (canvasRef.current) {
        canvasRef.current.appendChild(app.canvas);
        appRef.current = app;
        
        createBackground(app);
        showMessage(app, 'SPACE SHOOTER', 0x00FFFF);
        
        const subtitle = new PIXI.Text({
          text: 'Press START to begin',
          style: {
            fontSize: 24,
            fill: 0xFFFFFF,
            fontFamily: 'Courier New'
          }
        });
        subtitle.anchor.set(0.5);
        subtitle.x = app.screen.width / 2;
        subtitle.y = app.screen.height / 2 + 60;
        app.stage.addChild(subtitle);
      }
    });

    // Game loop
    const gameLoopInterval = setInterval(gameLoop, 16); // ~60 FPS

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      gameStateRef.current.keys[e.code] = true;
      
      if (e.code === 'Space' && gameStateRef.current.bulletsRemaining > 0 && gameStateRef.current.player) {
        e.preventDefault();
        const bullet = createBullet(app, gameStateRef.current.player.x, gameStateRef.current.player.y - 20);
        gameStateRef.current.bullets.push(bullet);
        gameStateRef.current.bulletsRemaining--;
        setGameInfo(prev => ({ ...prev, bullets: gameStateRef.current.bulletsRemaining }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gameStateRef.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      clearInterval(gameLoopInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (app) {
        app.destroy(true);
      }
    };
  }, []);

  const restartGame = () => {
    if (!appRef.current) return;
    
    const app = appRef.current;
    const gameState = gameStateRef.current;
    
    // Reset game state
    gameState.gameState = 'menu';
    gameState.bullets = [];
    gameState.asteroids = [];
    gameState.boss = null;
    gameState.bossBullets = [];
    gameState.player = null;
    
    setGameInfo({ bullets: 10, time: 60, state: 'menu', bossHp: 0, bossMaxHp: 4 });
    
    createBackground(app);
    showMessage(app, 'SPACE SHOOTER', 0x00FFFF);
    
    const subtitle = new PIXI.Text({
      text: 'Press START to begin',
      style: {
        fontSize: 24,
        fill: 0xFFFFFF,
        fontFamily: 'Courier New'
      }
    });
    subtitle.anchor.set(0.5);
    subtitle.x = app.screen.width / 2;
    subtitle.y = app.screen.height / 2 + 60;
    app.stage.addChild(subtitle);
  };

  return (
    <div className="flex flex-col items-center gap-4 bg-space-dark min-h-screen p-4">
      <div className="flex gap-8 items-center">
        <div className="game-ui text-lg font-mono">
          Bullets: {gameInfo.bullets}/10
        </div>
        <div className="game-timer text-lg font-mono">
          Time: {gameInfo.time}s
        </div>
        {gameInfo.state === 'level2' && (
          <div className="game-danger text-lg font-mono">
            Boss HP: {gameInfo.bossHp}/{gameInfo.bossMaxHp}
          </div>
        )}
      </div>
      
      <div className="border-2 border-space-accent rounded-lg overflow-hidden shadow-2xl">
        <div ref={canvasRef} />
      </div>
      
      <div className="flex gap-4">
        <Button 
          onClick={startLevel1}
          variant="default"
          className="bg-space-accent hover:bg-space-accent/80 text-space-dark font-mono"
          disabled={gameInfo.state !== 'menu' && gameInfo.state !== 'win' && gameInfo.state !== 'lose'}
        >
          START NEW GAME
        </Button>
        
        {(gameInfo.state === 'win' || gameInfo.state === 'lose') && (
          <Button 
            onClick={restartGame}
            variant="outline"
            className="border-space-accent text-space-accent hover:bg-space-accent hover:text-space-dark font-mono"
          >
            BACK TO MENU
          </Button>
        )}
      </div>
      
      <div className="text-center text-muted-foreground font-mono text-sm max-w-2xl">
        <p>Use ← → arrows to move, SPACE to shoot</p>
        <p>Level 1: Destroy all asteroids • Level 2: Defeat the Boss (4 hits)</p>
        <p>You have 10 bullets and 60 seconds per level</p>
      </div>
    </div>
  );
};