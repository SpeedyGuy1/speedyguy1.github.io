import * as THREE from 'three';

class Boid {
  constructor(mesh) {
    this.position = new THREE.Vector3(
      Math.random() * 400 - 200,
      Math.random() * 50 + 50,
      Math.random() * 400 - 200
    );
    this.velocity = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    );
    this.velocity.setLength(Math.random() * 4 + 2);
    this.acceleration = new THREE.Vector3();

    this.mesh = mesh; // The 3D object
    this.mesh.position.copy(this.position);

    this.maxForce = 0.05; // Steering force limit
    this.maxSpeed = 4.0;  // Speed limit
  }

  // --- Core Boids Rules ---

  // 1. Separation: Steer to avoid crowding local flockmates
  separate(boids, radius) {
    let steer = new THREE.Vector3();
    let count = 0;
    for (let other of boids) {
      let d = this.position.distanceTo(other.position);
      if (d > 0 && d < radius) {
        let diff = new THREE.Vector3().subVectors(this.position, other.position);
        diff.normalize();
        diff.divideScalar(d); // Weight by distance (closer = stronger)
        steer.add(diff);
        count++;
      }
    }
    if (count > 0) {
      steer.divideScalar(count);
    }
    if (steer.lengthSq() > 0) {
      steer.setLength(this.maxSpeed);
      steer.sub(this.velocity);
      steer.clampLength(0, this.maxForce);
    }
    return steer;
  }

  // 2. Alignment: Steer towards the average heading of local flockmates
  align(boids, radius) {
    let sum = new THREE.Vector3();
    let count = 0;
    for (let other of boids) {
      let d = this.position.distanceTo(other.position);
      if (d > 0 && d < radius) {
        sum.add(other.velocity);
        count++;
      }
    }
    if (count > 0) {
      sum.divideScalar(count);
      sum.setLength(this.maxSpeed);
      let steer = sum.sub(this.velocity);
      steer.clampLength(0, this.maxForce);
      return steer;
    } else {
      return new THREE.Vector3();
    }
  }

  // 3. Cohesion: Steer to move toward the average position of local flockmates
  cohere(boids, radius) {
    let sum = new THREE.Vector3();
    let count = 0;
    for (let other of boids) {
      let d = this.position.distanceTo(other.position);
      if (d > 0 && d < radius) {
        sum.add(other.position);
        count++;
      }
    }
    if (count > 0) {
      sum.divideScalar(count);
      return this.seek(sum); // Steer towards the center
    } else {
      return new THREE.Vector3();
    }
  }

  // --- Physics & Helpers ---

  // A helper to calculate steering force towards a target
  seek(target) {
    let desired = new THREE.Vector3().subVectors(target, this.position);
    desired.setLength(this.maxSpeed);
    let steer = new THREE.Vector3().subVectors(desired, this.velocity);
    steer.clampLength(0, this.maxForce);
    return steer;
  }

  // Apply all flocking forces
  flock(boids, params) {
    let sep = this.separate(boids, params.separationRadius);
    let ali = this.align(boids, params.alignmentRadius);
    let coh = this.cohere(boids, params.cohesionRadius);

    // Apply weights
    sep.multiplyScalar(params.separation);
    ali.multiplyScalar(params.alignment);
    coh.multiplyScalar(params.cohesion);

    this.acceleration.add(sep);
    this.acceleration.add(ali);
    this.acceleration.add(coh);
  }

  // Main update function, called every frame
  update(delta) {
    // Update velocity
    this.velocity.add(this.acceleration);
    this.velocity.clampLength(0, this.maxSpeed);
    
    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(delta * 10)); // Scale by delta

    // Reset acceleration for next frame
    this.acceleration.multiplyScalar(0);
  }

  // Keep boids within bounds and above the terrain
  wrapBounds(bounds, getGroundHeight) {
    // --- Keep birds from dipping into the ground ---
    const minY = getGroundHeight(this.position.x, this.position.z) + 10; // Ground height + 10 units buffer
    
    if (this.position.y < minY) {
        // If below min height, apply a strong upward force
        this.acceleration.y += 0.8; 
    }

    // --- World Bounds Wrapping ---
    if (this.position.x > bounds) this.position.x = -bounds;
    if (this.position.x < -bounds) this.position.x = bounds;
    
    // Y-axis wrapping (only top edge)
    if (this.position.y > bounds + 50) this.position.y = minY; // If too high, wrap near the ground
    
    if (this.position.z > bounds) this.position.z = -bounds;
    if (this.position.z < -bounds) this.position.z = bounds;
  }

  // Sync the 3D mesh with the physics position and orientation
  updateMesh() {
    this.mesh.position.copy(this.position);
    // Point the mesh in the direction of velocity
    this.mesh.lookAt(this.position.clone().add(this.velocity));
  }
}

export default Boid;