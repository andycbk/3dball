// main.js (增强版)

// 由于我们已经在HTML中通过<script>标签引入了库，
// 所以不需要再用import了。THREE和CANNON会成为全局变量。
// import * as THREE from '...'; // 这行要删除
// import * as CANNON from '...'; // 这行也要删除

class Game {
    constructor() {
        this.initEngine();
        this.initUI();
        this.addEventListeners();
        this.showMenu();
    }

    initEngine() {
        this.gameState = 'MENU';
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-canvas').appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        // ❗️简化背景，先用纯色，排除网络问题
        this.scene.background = new THREE.Color(0x334d7c); 

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 15);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        this.light = new THREE.DirectionalLight(0xffffff, 0.8);
        this.light.position.set(10, 20, 5);
        this.light.castShadow = true;
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        this.scene.add(this.light);

        this.physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) });
        this.clock = new THREE.Clock();
        this.objectsToUpdate = [];
    }

    initLevel() {
        this.createLevel();
        this.createBall();
        this.createStars();
        this.createFinishZone();
        this.ballBody.addEventListener('collide', (event) => this.handleCollision(event));
    }
    
    startGame() {
        this.resetGame();
        this.initLevel();

        this.gameState = 'PLAYING';
        this.updateUI();

        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', this.handleOrientation);
                    }
                }).catch(console.error);
        } else {
            window.addEventListener('deviceorientation', this.handleOrientation);
        }

        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
        this.animate();
    }
    
    resetGame() {
        if(this.ballMesh) this.scene.remove(this.ballMesh);
        if(this.ballBody) this.physicsWorld.removeBody(this.ballBody);
        
        // 清理所有动态创建的物体
        this.objectsToUpdate.forEach(obj => {
            if (obj.mesh) this.scene.remove(obj.mesh);
            if (obj.body) this.physicsWorld.removeBody(obj.body);
        });
        this.objectsToUpdate = [];

        this.score = 0;
        this.lives = 3;
        this.timeLeft = 60;
        this.gyro = { beta: 0, gamma: 0 };
        this.keysPressed = {}; // ✅ 用于键盘控制
        this.handleOrientation = this.handleOrientation.bind(this);
        if(this.timerInterval) clearInterval(this.timerInterval);
    }
    
    createLevel() {
        const platformMaterial = new CANNON.Material('platform');
        const levelLayout = [
            { size: [10, 1, 10], position: [0, 0, 0] },
            { size: [10, 1, 4], position: [0, 0, -7] },
            { size: [4, 1, 10], position: [7, 0, -12] },
            { size: [15, 1, 4], position: [15, -2, -12], isSlanted: true },
            { size: [4, 1, 10], position: [23, -4, -12] },
            { size: [10, 1, 4], position: [23, -4, -5] },
        ];

        levelLayout.forEach(data => {
            const mesh = new THREE.Mesh( new THREE.BoxGeometry(data.size[0], data.size[1], data.size[2]), new THREE.MeshStandardMaterial({ color: 0x4466aa }) );
            mesh.position.set(data.position[0], data.position[1], data.position[2]);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(data.size[0]/2, data.size[1]/2, data.size[2]/2)), position: new CANNON.Vec3(data.position[0], data.position[1], data.position[2]), material: platformMaterial });
            if(data.isSlanted) { body.quaternion.setFromEuler(-Math.PI / 16, 0, 0); mesh.quaternion.copy(body.quaternion); }
            this.physicsWorld.addBody(body);
            this.objectsToUpdate.push({mesh, body}); // Track for cleanup
        });
    }

    createBall() {
        const ballMaterial = new CANNON.Material('ball');
        this.ballMesh = new THREE.Mesh( new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.3, roughness: 0.4 }) );
        this.ballMesh.position.set(0, 2, 0);
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);

        this.ballBody = new CANNON.Body({ mass: 1.5, shape: new CANNON.Sphere(0.5), position: new CANNON.Vec3(0, 2, 0), material: ballMaterial });
        this.physicsWorld.addBody(this.ballBody);
        
        const ballPlatformContact = new CANNON.ContactMaterial(ballMaterial, this.physicsWorld.materials.find(m => m.name === 'platform'), { friction: 0.1, restitution: 0.3 });
        this.physicsWorld.addContactMaterial(ballPlatformContact);
    }
    
    createStars() {
        const starGeo = new THREE.TorusGeometry(0.4, 0.15, 8, 5);
        const starMat = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xffc107, emissiveIntensity: 0.5 });
        const starPositions = [ [0, 1.5, -7], [7, 1.5, -9], [7, 1.5, -15], [15, 0.5, -12], [23, -2.5, -15], [23, -2.5, -9] ];

        starPositions.forEach(pos => {
            const mesh = new THREE.Mesh(starGeo, starMat);
            mesh.position.set(pos[0], pos[1], pos[2]);
            mesh.castShadow = true;
            this.scene.add(mesh);
            const body = new CANNON.Body({ isTrigger: true, mass: 0, shape: new CANNON.Sphere(0.7), position: new CANNON.Vec3(pos[0], pos[1], pos[2]) });
            body.isStar = true; body.starMesh = mesh;
            this.physicsWorld.addBody(body);
            this.objectsToUpdate.push({mesh, body}); // Track for cleanup
        });
    }

    createFinishZone() {
        const finishMesh = new THREE.Mesh( new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 }) );
        finishMesh.position.set(23, -3.9, -5);
        this.scene.add(finishMesh);

        this.finishBody = new CANNON.Body({ isTrigger: true, mass: 0, shape: new CANNON.Box(new CANNON.Vec3(2, 2, 2)), position: new CANNON.Vec3(23, -3.9, -5) });
        this.finishBody.isFinish = true;
        this.physicsWorld.addBody(this.finishBody);
        this.objectsToUpdate.push({mesh: finishMesh, body: this.finishBody}); // Track for cleanup
    }

    animate() {
        if(this.gameState !== 'PLAYING' && this.gameState !== 'PAUSED') return;

        this.animationFrameId = requestAnimationFrame(() => this.animate());
        
        if (this.gameState === 'PLAYING') {
            const deltaTime = this.clock.getDelta();
            this.physicsWorld.step(1 / 60, deltaTime, 3);
            
            this.applyForces();

            this.ballMesh.position.copy(this.ballBody.position);
            this.ballMesh.quaternion.copy(this.ballBody.quaternion);
            
            this.objectsToUpdate.forEach(obj => {
                if (obj.body.isStar && obj.mesh) obj.mesh.rotation.y += 0.02;
            });

            this.updateCamera();
            this.checkFall();
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    applyForces() {
        const forceMagnitude = 60;
        // 陀螺仪控制
        let force = new CANNON.Vec3( this.gyro.gamma / 90 * forceMagnitude, 0, this.gyro.beta / 90 * forceMagnitude );
        
        // ✅ 键盘控制 (如果按键被按下，则覆盖陀螺仪的力)
        if (this.keysPressed.w || this.keysPressed.ArrowUp) force.z = -forceMagnitude;
        if (this.keysPressed.s || this.keysPressed.ArrowDown) force.z = forceMagnitude;
        if (this.keysPressed.a || this.keysPressed.ArrowLeft) force.x = -forceMagnitude;
        if (this.keysPressed.d || this.keysPressed.ArrowRight) force.x = forceMagnitude;
        
        this.ballBody.applyForce(force, this.ballBody.position);
    }

    updateCamera() {
        const offset = new THREE.Vector3(0, 8, 10);
        const targetPosition = this.ballMesh.position.clone().add(offset);
        this.camera.position.lerp(targetPosition, 0.05);
        this.camera.lookAt(this.ballMesh.position);
        this.light.position.copy(this.camera.position).add(new THREE.Vector3(-5, 5, -5));
        this.light.target = this.ballMesh;
    }

    handleCollision(event) {
        const body = event.body;
        if (body.isStar && !body.isCollected) {
            body.isCollected = true;
            this.score += 10;
            this.scene.remove(body.starMesh);
            this.physicsWorld.removeBody(body);
            this.updateUI();
        }
        if (body.isFinish) this.winGame();
    }

    checkFall() {
        if (this.ballBody.position.y < -20) {
            this.lives--;
            this.updateUI();
            if (this.lives <= 0) this.gameOver();
            else this.resetBallPosition();
        }
    }

    resetBallPosition() {
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        this.ballBody.position.set(0, 2, 0);
    }

    updateTimer() {
        if(this.gameState !== 'PLAYING') return;
        this.timeLeft--;
        this.updateUI();
        if (this.timeLeft <= 0) this.gameOver();
    }
    
    gameOver() {
        if (this.gameState === 'GAMEOVER') return;
        this.gameState = 'GAMEOVER';
        clearInterval(this.timerInterval);
        this.updateUI();
    }

    winGame() {
        if (this.gameState === 'WIN') return;
        this.gameState = 'WIN';
        clearInterval(this.timerInterval);
        this.score += this.timeLeft * 5;
        this.updateUI();
    }

    pauseGame() {
        if(this.gameState !== 'PLAYING') return;
        this.gameState = 'PAUSED';
        this.updateUI();
    }

    resumeGame() {
        if(this.gameState !== 'PAUSED') return;
        this.gameState = 'PLAYING';
        this.updateUI();
    }
    
    initUI() {
        this.ui = {
            hud: document.getElementById('ui-hud'),
            menu: document.getElementById('ui-menu'),
            pause: document.getElementById('ui-pause'),
            gameover: document.getElementById('ui-gameover'),
            win: document.getElementById('ui-win'),
            score: document.getElementById('score'),
            timer: document.getElementById('timer'),
            lives: document.getElementById('lives'),
            finalScore: document.getElementById('final-score'),
            winScore: document.getElementById('win-score'),
            highScore: document.getElementById('high-score'),
        };
        this.highScore = localStorage.getItem('highScore') || 0;
        this.ui.highScore.textContent = this.highScore;
    }
    
    updateUI() {
        // Hide all layers and controls
        this.ui.hud.style.display = 'none';
        this.ui.menu.classList.remove('active');
        this.ui.pause.classList.remove('active');
        this.ui.gameover.classList.remove('active');
        this.ui.win.classList.remove('active');
        document.getElementById('game-controls').style.display = 'none';

        if (this.gameState === 'MENU') {
            this.ui.menu.classList.add('active');
        } else if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') {
            this.ui.hud.style.display = 'flex';
            document.getElementById('game-controls').style.display = 'block';
            this.ui.score.textContent = `Score: ${this.score}`;
            const minutes = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
            const seconds = (this.timeLeft % 60).toString().padStart(2, '0');
            this.ui.timer.textContent = `${minutes}:${seconds}`;
            this.ui.lives.innerHTML = '❤️'.repeat(this.lives);
            if (this.gameState === 'PAUSED') this.ui.pause.classList.add('active');
        } else if (this.gameState === 'GAMEOVER') {
            this.ui.gameover.classList.add('active');
            this.ui.finalScore.textContent = this.score;
            this.updateHighScore();
        } else if (this.gameState === 'WIN') {
            this.ui.win.classList.add('active');
            this.ui.winScore.textContent = this.score;
            this.updateHighScore();
        }
    }
    
    showMenu() { this.gameState = 'MENU'; this.updateUI(); }
    
    updateHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('highScore', this.highScore);
            this.ui.highScore.textContent = this.highScore;
        }
    }

    addEventListeners() {
        document.getElementById('start-button').addEventListener('click', () => this.startGame());
        document.getElementById('pause-button').addEventListener('click', () => this.pauseGame());
        document.getElementById('resume-button').addEventListener('click', () => this.resumeGame());
        
        [document.getElementById('restart-button-pause'), document.getElementById('restart-button-gameover'), document.getElementById('play-next-level-button')]
        .forEach(btn => btn.addEventListener('click', () => this.startGame()));
        
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // ✅ 键盘事件监听
        window.addEventListener('keydown', (event) => { this.keysPressed[event.key] = true; });
        window.addEventListener('keyup', (event) => { this.keysPressed[event.key] = false; });
    }
    
    handleOrientation(event) {
        this.gyro.beta = event.beta ? Math.max(-90, Math.min(90, event.beta)) : 0;
        this.gyro.gamma = event.gamma ? Math.max(-90, Math.min(90, event.gamma)) : 0;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
