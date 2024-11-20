import * as THREE from "three";
import { fragmentShader } from "./cloudShaders.js";

class Cloud {
  constructor({
    cloudSize = new THREE.Vector3(0.5, 1.0, 0.5),
    sunPosition = new THREE.Vector3(1.0, 2.0, 1.0),
    cloudColor = new THREE.Color(0xeabf6b),
    skyColor = new THREE.Color(0x337fff),
    cloudSteps = 48,
    shadowSteps = 8,
    cloudLength = 16,
    shadowLength = 2,
    regress = false
  } = {}) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCloudSize: {
          value: cloudSize
        },
        uSunPosition: {
          value: sunPosition
        },
        uCameraPosition: {
          value: new THREE.Vector3()
        },
        uCloudColor: {
          value: cloudColor
        },
        uSkyColor: {
          value: skyColor
        },
        uCloudSteps: {
          value: cloudSteps
        },
        uShadowSteps: {
          value: shadowSteps
        },
        uCloudLength: {
          value: cloudLength
        },
        uShadowLength: {
          value: shadowLength
        },
        uResolution: {
          value: new THREE.Vector2()
        },
        uTime: {
          value: 0
        },
        uRegress: {
          value: regress
        },
        projectionMatrixInverse: {
          value: null
        },
        viewMatrixInverse: {
          value: null
        }
      },
      fragmentShader
    });

    super(material);
  }

  get cloudSize() {
    return this.material.uniforms.uCloudSize.value;
  }

  get sunPosition() {
    return this.material.uniforms.uSunPosition.value;
  }

  get skyColor() {
    return this.material.uniforms.uSkyColor.value;
  }

  get regress() {
    return this.material.uniforms.uRegress.value;
  }

  set regress(value) {
    this.material.uniforms.uRegress.value = value;
  }

  get time() {
    return this.material.uniforms.uTime.value;
  }

  set time(value) {
    return (this.material.uniforms.uTime.value = value);
  }

  setSize(width, height) {
    this.material.uniforms.uResolution.value.set(width, height);
  }

  render(renderer, camera) {
    this.material.uniforms.uCameraPosition.value.copy(camera.position);
    this.material.uniforms.projectionMatrixInverse.value = camera.projectionMatrixInverse;
    this.material.uniforms.viewMatrixInverse.value = camera.matrixWorld;
    super.render(renderer);
  }
}

export function createCloud() {
    let cloud = new Cloud({
        cloudSize: new THREE.Vector3(0.5, 1.0, 0.5),
        sunPosition: new THREE.Vector3(1.0, 2.0, 1.0),
        cloudColor: new THREE.Color(0xeabf6b),
        skyColor: new THREE.Color(0x337fff),
        cloudSteps: 48,
        shadowSteps: 8,
        cloudLength: 16,
        shadowLength: 2,
        noise: false
    });

    return { cloud };
}
