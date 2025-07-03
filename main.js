// js/main.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.19.0/dist/cannon-es.js';
// 你需要将其他JS文件也改为模块并导入
// 例如: import { World } from './World.js';

class Game {
    constructor() {
        this.gameState = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
        this.initEngine();
        this.initPhysics();
        this.initScene();
        this.initControls();
        this.initUI();
        this.animate();
    }

    initEngine() {
        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        document.getElementById('game-canvas').appendChild(this.renderer.domElement);

        // 场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // 天空蓝背景

        // 相机
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 10, 12);
        this.camera.lookAt(0, 0, 0);
    }

    initPhysics() {
        this.physicsWorld = new CANNON.World({
            gravity: new CANNON.Vec3(0, -20, 0), // 增加重力
        });
        this.clock = new THREE.Clock();
        this.objectsToUpdate = []; // 存储需要同步物理和视觉的物体
    }

    initScene() {
        // 光照
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // 创建地面 (这里仅为示例，复杂关卡应在World.js中创建)
        const groundGeo = new THREE.PlaneGeometry(30, 30);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);

        const groundBody = new CANNON.Body({
            mass: 0, // 静态
            shape: new CANNON.Plane(),
            material: new CANNON.Material('ground')
        });
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.physicsWorld.addBody(groundBody);
        
        // 创建小球 (Ball.js)
        const ballRadius = 0.5;
        const ballGeo = new THREE.SphereGeometry(ballRadius, 32, 32);
        const ballMat = new THREE.MeshStandardMaterial({ color: 0xff4757 }); // 鲜艳的颜色
        this.ballMesh = new THREE.Mesh(ballGeo, ballMat);
        this.ballMesh.position.y = 5;
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);

        const ballBody = new CANNON.Body({
            mass: 1,
            shape: new CANNON.Sphere(ballRadius),
            position: new CANNON.Vec3(0, 5, 0),
            material: new CANNON.Material('ball')
        });
        this.physicsWorld.addBody(ballBody);
        this.ballBody = ballBody;

        this.objectsToUpdate.push({ mesh: this.ballMesh, body: this.ballBody });
    }

    initControls() {
        this.gyro = { beta: 0, gamma: 0 };
        const handleOrientation = (event) => {
            // 将角度限制在-90到90之间
            this.gyro.beta = Math.max(-90, Math.min(90, event.beta)); // 前后倾斜
            this.gyro.gamma = Math.max(-90, Math.min(90, event.gamma)); // 左右倾斜
        };
        
        // 陀螺仪需要用户授权，通常在点击事件后请求
        document.getElementById('start-button').addEventListener('click', () => {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                            this.startGame();
                        }
                    })
                    .catch(console.error);
            } else {
                // 对于不支持请求权限的设备（如安卓）
                window.addEventListener('deviceorientation', handleOrientation);
                this.startGame();
            }
        });
    }

    initUI() {
        // ... (此处添加对所有按钮的事件监听，并根据gameState切换UI)
        document.getElementById('pause-button').addEventListener('click', () => this.pauseGame());
        document.getElementById('resume-button').addEventListener('click', () => this.resumeGame());
        // ... 其他按钮
    }
    
    startGame() {
        this.gameState = 'PLAYING';
        document.getElementById('ui-menu').classList.remove('active');
        document.getElementById('game-controls').style.display = 'block';
        // 重置游戏状态：分数、时间、生命
    }

    pauseGame() {
        if(this.gameState !== 'PLAYING') return;
        this.gameState = 'PAUSED';
        document.getElementById('ui-pause').classList.add('active');
    }
    
    resumeGame() {
        if(this.gameState !== 'PAUSED') return;
        this.gameState = 'PLAYING';
        document.getElementById('ui-pause').classList.remove('active');
    }

    applyForces() {
        if (this.gameState !== 'PLAYING') return;

        const forceMagnitude = 30;
        const force = new CANNON.Vec3(
            this.gyro.gamma / 90 * forceMagnitude, // 左/右 -> X轴
            0,
            this.gyro.beta / 90 * forceMagnitude   // 前/后 -> Z轴
        );
        this.ballBody.applyForce(force, this.ballBody.position);
    }

    updateCamera() {
        // 相机跟随小球
        const offset = new THREE.Vector3(0, 8, 10);
        this.camera.position.lerp(this.ballMesh.position.clone().add(offset), 0.1);
        this.camera.lookAt(this.ballMesh.position);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = this.clock.getDelta();
        
        if (this.gameState === 'PLAYING') {
            this.physicsWorld.step(1 / 60, deltaTime, 3);
            this.applyForces();

            // 同步物理世界和渲染世界
            for (const object of this.objectsToUpdate) {
                object.mesh.position.copy(object.body.position);
                object.mesh.quaternion.copy(object.body.quaternion);
            }
            
            this.updateCamera();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// 启动游戏
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});