import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import Boid from './bird.js';
import { createNoise3D } from 'simplex-noise'; 

let scene, renderer, clock;
let generalCamera, birdCamera, currentCamera;
let orbitControls;
let sky, sun;
let boids = [];
let targetBoid;

// --- Terrain & Raycasting Variables ---
let terrainMesh; 
let raycaster, downVector; 
const noise3D = createNoise3D(); 
const TERRAIN_RESOLUTION = 64; 

const worldBounds = 300; // How far boids can fly before wrapping

// Simulation parameters
const params = {
  // Boid Physics
  separation: 2.0,
  alignment: 1.0,
  cohesion: 1.0,
  separationRadius: 30,
  alignmentRadius: 50,
  cohesionRadius: 50,
  // Camera
  cameraMode: 'General',
};

// --- Helper Functions ---

/** Creates a placeholder mesh for a bird (a cone) */
function createBirdMesh() {
  const geometry = new THREE.ConeGeometry(1, 4, 8);
  geometry.rotateX(Math.PI / 2); // Point it forward (along Z)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.5,
    roughness: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/** Creates terrain using Perlin Noise */
function createTerrain() {
    const geometry = new THREE.PlaneGeometry(
        worldBounds * 2, 
        worldBounds * 2, 
        TERRAIN_RESOLUTION, 
        TERRAIN_RESOLUTION
    );
    
    const material = new THREE.MeshStandardMaterial({
        color: 0x3e8a4a, 
        metalness: 0.1,
        roughness: 0.8,
    });
    
    // --- Generate Heights using Noise ---
    const positionAttribute = geometry.getAttribute('position');
    const vertexCount = positionAttribute.count;
    
    for (let i = 0; i < vertexCount; i++) {
        const x = positionAttribute.getX(i);
        const z = positionAttribute.getY(i); // PlaneGeometry's Z is initially Y here
        
        // Combine multiple noise layers for complex terrain
        let height = 0;
        height += noise3D(x * 0.005, z * 0.005, 0) * 40; // Large hills
        height += noise3D(x * 0.015, z * 0.015, 0) * 10; // Medium features
        height += noise3D(x * 0.03, z * 0.03, 0) * 3;   // Fine wrinkles
        
        positionAttribute.setZ(i, height); // Set the height on the Z-axis
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); // Recalculate normals for correct lighting

    const terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2; // Rotate to lay flat (Z-axis becomes Y-axis)
    terrain.receiveShadow = true;
    scene.add(terrain);

    return terrain; // Return the mesh
}

/** Returns the Y-coordinate (height) of the ground at a given X, Z coordinate using Raycasting */
function getGroundHeight(x, z) {
    if (!terrainMesh) return 0;
    
    // 1. Position the raycaster origin high above the terrain
    const origin = new THREE.Vector3(x, 500, z);

    // 2. Set the ray to point straight down
    raycaster.set(origin, downVector);

    // 3. Check for intersection with the terrain
    const intersects = raycaster.intersectObject(terrainMesh, false);

    if (intersects.length > 0) {
        return intersects[0].point.y; // Return the intersection point's Y-coordinate
    }
    
    return 0; 
}

/** Creates thousands of trees efficiently using InstancedMesh */
function createVegetation() {
  const treeCount = 2000;
  
  // 1. Create the shape of a single tree
  const trunkGeo = new THREE.CylinderGeometry(0.5, 1, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d411f }); // Brown
  const leavesGeo = new THREE.ConeGeometry(3, 10, 6);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2a522a }); // Dark green

  // 2. Create the InstancedMesh
  const trunkInstance = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const leavesInstance = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
  trunkInstance.castShadow = true;
  leavesInstance.castShadow = true;

  // 3. Scatter and plant them on the terrain
  const dummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const x = Math.random() * worldBounds * 2 - worldBounds;
    const z = Math.random() * worldBounds * 2 - worldBounds;
    const scale = Math.random() * 0.5 + 0.75; 

    // --- Get the height of the ground at this position ---
    const groundY = getGroundHeight(x, z);

    // Trunk
    dummy.position.set(x, groundY + (4 * scale), z); 
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkInstance.setMatrixAt(i, dummy.matrix);

    // Leaves
    dummy.position.set(x, groundY + (12 * scale), z); 
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    leavesInstance.setMatrixAt(i, dummy.matrix);
  }
  
  scene.add(trunkInstance);
  scene.add(leavesInstance);
}

/** Sets up the GUI controls */
function createGUI() {
  const gui = new GUI();
  const flockFolder = gui.addFolder('Flocking Parameters');
  flockFolder.add(params, 'separation', 0.1, 5.0, 0.1).name('Separation Force');
  flockFolder.add(params, 'alignment', 0.1, 5.0, 0.1).name('Alignment Force');
  flockFolder.add(params, 'cohesion', 0.1, 5.0, 0.1).name('Cohesion Force');
  flockFolder.add(params, 'separationRadius', 5, 100, 1).name('Separation Radius');
  flockFolder.add(params, 'alignmentRadius', 5, 100, 1).name('Alignment Radius');
  flockFolder.add(params, 'cohesionRadius', 5, 100, 1).name('Cohesion Radius');
  
  const cameraFolder = gui.addFolder('Camera');
  cameraFolder.add(params, 'cameraMode', ['General', 'Bird View']).onChange(val => {
    if (val === 'General') {
      currentCamera = generalCamera;
      orbitControls.enabled = true;
    } else {
      currentCamera = birdCamera;
      orbitControls.enabled = false;
    }
  });
}

/** Sets up the realistic sky */
function createSky() {
  sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  sun = new THREE.Vector3();

  const effectController = {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation: 2,
    azimuth: 180,
  };

  const uniforms = sky.material.uniforms;
  uniforms['turbidity'].value = effectController.turbidity;
  uniforms['rayleigh'].value = effectController.rayleigh;
  uniforms['mieCoefficient'].value = effectController.mieCoefficient;
  uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
  const theta = THREE.MathUtils.degToRad(effectController.azimuth);

  sun.setFromSphericalCoords(1, phi, theta);
  uniforms['sunPosition'].value.copy(sun);
}

// --- Main Init & Animate ---

function init() {
  // Basic Setup
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8cb6e2, 50, worldBounds * 1.5); // Add fog for atmosphere

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.getElementById('app').appendChild(renderer.domElement);

  // Cameras
  generalCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  generalCamera.position.set(0, 150, 200);
  
  birdCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
  
  currentCamera = generalCamera; // Start with general view

  // Controls
  orbitControls = new OrbitControls(generalCamera, renderer.domElement);
  orbitControls.target.set(0, 50, 0);
  orbitControls.update();

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.position.set(-50, 100, 50); // Match sun position angle
  dirLight.castShadow = true;
  dirLight.shadow.camera.top = 150;
  dirLight.shadow.camera.bottom = -150;
  dirLight.shadow.camera.left = -150;
  dirLight.shadow.camera.right = 150;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // 1. Scene Objects that DO NOT depend on raycasting (Sky)
  createSky();
  
  // 2. Create Terrain and store its mesh for height checking
  terrainMesh = createTerrain();
  // --- FIX for Floating Trees ---
  // Ensure the terrain's world matrix is updated for accurate raycasting
  terrainMesh.updateMatrixWorld(true);

  // 3. Raycasting Setup (MUST come before vegetation/boids that need height data)
  raycaster = new THREE.Raycaster();
  downVector = new THREE.Vector3(0, -1, 0); 

  // 4. Scene Objects that DEPEND on raycasting (Trees)
  createVegetation(); 
  createGUI();

  // 5. Create Boids
  const birdMeshTemplate = createBirdMesh();
  
  for (let i = 0; i < 150; i++) {
    const boid = new Boid(birdMeshTemplate.clone());
    boids.push(boid);
    scene.add(boid.mesh);
  }
  targetBoid = boids[0]; // Set the first boid as the follow-cam target
  
  // Handle window resizing
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  generalCamera.aspect = window.innerWidth / window.innerHeight;
  generalCamera.updateProjectionMatrix();
  
  birdCamera.aspect = window.innerWidth / window.innerHeight;
  birdCamera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

/** Updates the 'Bird View' camera to follow the target boid */
function updateBirdCamera(delta) {
  // 1. Calculate desired camera position: behind and slightly above the bird
  const offset = new THREE.Vector3(0, 3, -10); // Base offset
  offset.applyQuaternion(targetBoid.mesh.quaternion); // Rotate offset to match bird direction
  const desiredCamPos = targetBoid.position.clone().add(offset);

  // 2. Calculate desired look-at point: in front of the bird
  const lookAtPos = targetBoid.position.clone().add(targetBoid.velocity.clone().normalize().multiplyScalar(10));

  // 3. Smoothly interpolate (Lerp) to the new positions for smooth movement
  const lerpFactor = delta * 2.0; 
  birdCamera.position.lerp(desiredCamPos, lerpFactor);
  
  const tempLookAt = birdCamera.userData.lookAtTarget || lookAtPos.clone();
  tempLookAt.lerp(lookAtPos, lerpFactor);
  birdCamera.userData.lookAtTarget = tempLookAt; 
  
  birdCamera.lookAt(tempLookAt);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Update all boids
  for (let boid of boids) {
    boid.flock(boids, params); // Calculate acceleration
    boid.update(delta);         // Apply physics
    
    // Pass the height function to ensure birds fly above the terrain
    boid.wrapBounds(worldBounds, getGroundHeight); 
    
    boid.updateMesh();          // Sync 3D model
  }

  // Update camera
  if (params.cameraMode === 'General') {
    orbitControls.update();
  } else {
    updateBirdCamera(delta);
  }

  // Render the scene
  renderer.render(scene, currentCamera);
}

// --- Start the simulation ---
init();
animate();