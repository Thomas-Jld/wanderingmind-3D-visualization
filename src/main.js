import './assets/main.css'

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { kdTree } from 'kd-tree-javascript';

import points from './assets/old-points.json';
import { loadImageData } from './utils.js';
import { AudioEngine } from './audio.js';
// import { createCloud } from './cloud.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';


// Create an empty Scene
const scene = new THREE.Scene();

// Create a basic Perspective Camera
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 100000 );
// camera.position.x = 10;
camera.position.y = 10;
camera.position.z = -10;
camera.lookAt(5, 0, 10);

// Fetch the canvas element created in index.html
const canvas = document.getElementById('wanderingmind-canvas');

// Create a WebGLRenderer and set its width and height
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
});

renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );


const renderScene = new RenderPass( scene, camera );
const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
const bokehPass = new BokehPass( scene, camera, {
    focus: 10.0,
    aperture: 0.25,
    maxblur: 0.005
} );
const outputPass = new OutputPass();

const composer = new EffectComposer( renderer );
composer.addPass( renderScene );
// composer.addPass( bloomPass );
// composer.addPass( bokehPass );
composer.addPass( outputPass );

// Add OrbitControls so that we can pan around with the mouse
const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.minDistance = 2;
controls.maxDistance = 10;
controls.enablePan = true;



// Lil-gui
const gui = new GUI();
const guiParameters = {
    autoRotate: true,
    maxSimultaneous: 5,
    searchLimit: 100,
    searchScale: 1.0,
    volume: 0.5,
};

gui.add( guiParameters, 'autoRotate' ); // Button
gui.add( guiParameters, 'maxSimultaneous', 1, 20, 1 ); // Slider
gui.add( guiParameters, 'searchLimit', 1, 200, 1 ).onChange((value) => listenAtPoint(focusedPoint));
gui.add( guiParameters, 'searchScale', 0.1, 2.0, 0.1 ).onChange((value) => changeScale(value));
gui.add( guiParameters, 'volume', 0.0, 1.0, 0.01 ).onChange((value) => {
    // audioContext.gainNode.gain.value = Math.min(value, audioContext.gainNode.gain.value);
});


// Convert points coordinates to more usable coordinates
let localPoints = points.map((point, i) => {
    return i % 3 == 0 ? (point - 1024) / 128 : i % 3 == 1 ? point / 128 : (1024 - point) / 128;
});


const reducedPoints = localPoints;
// const pointsPosMap = {};

// for (let i = 0; i < localPoints.length; i += 3) {
//     // if (Math.random() < 0.05) {
//     pointsPosMap[i] = reducedPoints.length / 3;
//     reducedPoints.push(localPoints[i]);
//     reducedPoints.push(localPoints[i + 1]);
//     reducedPoints.push(localPoints[i + 2]);
//     // }
// }

// console.log(pointsPosMap);

// Create particles from the points
const particlesColors = new THREE.Color( );
particlesColors.setHSL( 0.08, 0.8, 0.5 );
const particlesHighlightColor = new THREE.Color( );
particlesHighlightColor.setHSL( 0.08, 1.0, 1.0 );
const colors = [];
for ( let i = 0; i < reducedPoints.length; i += 3 ) {
    colors.push( particlesColors.r, particlesColors.g, particlesColors.b );
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute( 'customColor', new THREE.Float32BufferAttribute( colors, 3 ) );
const vertices = new Float32Array(reducedPoints);

geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
        attribute vec3 customColor;

        varying vec3 vColor;
        void main() {
            vColor = customColor;
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            gl_PointSize = 0.03 * ( 300.0 / -mvPosition.z );
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D texture1;
        varying vec3 vColor;
            void main() {
                vec2 offset = 2.0*(gl_PointCoord - vec2(0.5));
                float r = 1.0 - (pow(offset.x, 2.0) + pow(offset.y, 2.0));
                // float alpha = texture2D(texture1, gl_PointCoord).a;
                gl_FragColor = vec4(vColor, r);
        }
    `,
    uniforms: {
        texture1: {
            value: new THREE.TextureLoader().load( "/particle.png" )
        }
    },
    transparent: true,
    opacity: 0.5,
    depthWrite: true,
});

const pointsObject = new THREE.Points(geometry, material);
scene.add(pointsObject);





// Add a plane to raycast on
const planeRes = 100;
const planeGeometry = new THREE.PlaneGeometry(16, 16, planeRes, planeRes );
const planeMaterial = new THREE.MeshPhongMaterial(
    {
        color : 0xFFFFFF,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        depthTest: false,
    });
const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
planeMesh.rotation.x = Math.PI /2;
scene.add(planeMesh);



// Load the old-heightmap and apply it to the plane by displacing the vertices
// Source: https://discourse.threejs.org/t/how-to-draw-a-line-between-points-in-world-space/1743/4

const tempCanvas = document.createElement("canvas");
const ctx = tempCanvas.getContext("2d");
const heightMap = new THREE.TextureLoader().load("/old-heightmap.png", (heightMap) => {
    tempCanvas.width = heightMap.image.width;
    tempCanvas.height = heightMap.image.height;

    ctx.drawImage(heightMap.image, 0, 0, heightMap.image.width, heightMap.image.height);
    ctx.willReadFrequently = true;

    var wdth = planeGeometry.parameters.widthSegments + 1;
    var hght = planeGeometry.parameters.heightSegments + 1;
    var widthStep = heightMap.image.width / wdth;
    var heightStep = heightMap.image.height / hght;

    for (var h = 0; h < hght; h++) {
        for (var w = 0; w < wdth; w++) {
            var imgData = ctx.getImageData(Math.round(w * widthStep + 10), Math.round(h * heightStep + 10), 1, 1).data;
            var displacementVal = imgData[0] / 255.0;
            displacementVal *= -2;
            var idx = (h * wdth) + w;
            planeGeometry.attributes.position.array[idx * 3 + 2] = displacementVal;
        }
    }
    planeGeometry.attributes.position.needsUpdate = true;
    planeGeometry.computeVertexNormals();
});

const heightMapValues = [];
loadImageData("/old-heightmap.png", heightMapValues);



// Create a kd-tree to find the nearest points
const customDist = function (a, b) {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1],2));
}
const points2d = [];
for (let i = 0; i < localPoints.length; i += 3) points2d.push([localPoints[i], localPoints[i + 2], i / 3]);
const tree = new kdTree(points2d, customDist, [0, 1]);



// Add a light to the scene
const light = new THREE.AmbientLight( 0xFFFFFF );
scene.add( light );



// Create a ring using a torus geometry to show the intersection point
const defaultSelectionRadius = 0.2;
let selectionRadius = defaultSelectionRadius;
const torusGeometry = new THREE.TorusGeometry( selectionRadius, 0.01, 64, 100 );
const torusGeometryReference = new THREE.TorusGeometry( 0.1, 0.01, 64, 100 );
const torusMaterial = new THREE.MeshBasicMaterial( {
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    depthTest: false,
} );
const torus = new THREE.Mesh( torusGeometry, torusMaterial );
const referenceTorus = new THREE.Mesh( torusGeometryReference, torusMaterial );
torus.rotation.x = Math.PI / 2;
scene.add( torus );

// Convert a position to a vertex id on the plane
function positionToPlaneVertexId(x, z) {
    const i = Math.round((x + 8)/16 * planeRes);
    const j = Math.round(planeRes - (z + 8)/16 * planeRes);
    return j * (planeRes + 1) + i;
}

function positionToHeight(x, z) {
    if(!heightMapValues.length) return 0.0;
    // return -2 * ctx.getImageData(Math.round((x + 8)/16 * 2048), Math.round(2048 - (z + 8)/16 * 2048 + 0), 1, 1).data[0] / 255.0;
    return -2 * heightMapValues[Math.round((x + 8)/16 * 2048) + 2048 * Math.round(2048 - (z + 8)/16 * 2048)] / 255.0;
}

function shapeTorusAt(torus, point) {
    torus.position.x = point.x;
    torus.position.y = 0.0;
    torus.position.z = point.z;
    let overAnEdge = false;

    for (let i = 0; i < torus.geometry.attributes.position.array.length; i += 3) {
        let x = torus.position.x + torus.geometry.attributes.position.array[i] * selectionRadius / defaultSelectionRadius;
        let z = torus.position.z + torus.geometry.attributes.position.array[i + 1] * selectionRadius / defaultSelectionRadius;

        let y = positionToHeight(x, z);
        if (y < -0.01) overAnEdge = true;
        torus.geometry.attributes.position.array[i + 2] = referenceTorus.geometry.attributes.position.array[i + 2] + y;
    }
    torus.geometry.attributes.position.needsUpdate = true;
    return overAnEdge;
}


// Create a tube
const beam = new THREE.Group();
const beamTubeGeometry = new THREE.TubeGeometry( new THREE.CatmullRomCurve3( [
    new THREE.Vector3( 0, 0, 0 ),
    new THREE.Vector3( 0, 50, 0 )
] ), 1, selectionRadius, 32, false );
const beamTubeMaterial = new THREE.MeshBasicMaterial( {
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
} );
const beamTube = new THREE.Mesh( beamTubeGeometry, beamTubeMaterial );
beam.add(beamTube);

const beamTorusGeometry = new THREE.TorusGeometry( selectionRadius, 0.03, 64, 100 );
const beamTorusMaterial = new THREE.MeshBasicMaterial( {
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
} );
const beamTorus = new THREE.Mesh( beamTorusGeometry, beamTorusMaterial );
beamTorus.rotation.x = Math.PI / 2;
beam.add(beamTorus);

scene.add(beam);

function shapeTubeAt(tube, point) {
    tube.position.x = point.x;
    tube.position.y = 0.0;
    tube.position.z = point.z;

    for (let i = 0; i < tube.geometry.attributes.position.array.length/2; i += 3) {
        let x = tube.position.x + tube.geometry.attributes.position.array[i] * selectionRadius / defaultSelectionRadius;
        let z = tube.position.z + tube.geometry.attributes.position.array[i + 2] * selectionRadius / defaultSelectionRadius;

        let y = positionToHeight(x, z);
        tube.geometry.attributes.position.array[i + 1] = -y ;
    }
    tube.geometry.attributes.position.needsUpdate = true;
}



// *************** Audio *************** //
let nearestAudioPoints = [];
let previouslySelectedPoints = [];
let audioEngine;
// Loading loop: play the next audio in the queue every few seconds, based on the number of simultaneous audio
let loadingLoop = () => {
    if(audioEngine) {
        audioEngine.playNextInQueue(audioEngine.nodeNumber, nearestAudioPoints, guiParameters);
    }
    setTimeout(loadingLoop, 1000 * (5.0 / guiParameters.maxSimultaneous));
}
loadingLoop();



// *************** Mouse Interactions *************** //
// Add a raycaster to detect intersections with the plane
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let mouseMovements = 0;
let lastInteraction = Date.now();
const maxMouseMovements = 5;


// Update the pointer position every time the mouse moves
function onPointerMove( event ) {
	pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

    mouseMovements += 1;
}
window.addEventListener( 'pointermove', onPointerMove, false );



let sketchTubesGroup = new THREE.Group()
scene.add(sketchTubesGroup);
let distancesBetweenPoints = []
function createLinePath(startPoint, endPoint) {
    const yOffset = 0.0;
    startPoint = new THREE.Vector3(startPoint.x, startPoint.y+yOffset, startPoint.z)
    endPoint = new THREE.Vector3(endPoint.x, endPoint.y+yOffset, endPoint.z)
    const points = [startPoint.clone()];
    distancesBetweenPoints.push(startPoint.distanceTo(endPoint));

    let currentPoint = startPoint.clone();
    let direction = new THREE.Vector3();
    direction.subVectors(endPoint, startPoint);
    direction.normalize();
    direction.multiplyScalar(0.1);
    currentPoint.add(direction);
    while (currentPoint.distanceTo(endPoint) > 0.2) {
        let y = yOffset - positionToHeight(currentPoint.x, currentPoint.z);
        points.push(new THREE.Vector3(currentPoint.x, y, currentPoint.z));
        currentPoint.add(direction);
    }
    points.push(endPoint);

    const sketchTubeGeometry = new THREE.TubeGeometry( new THREE.CatmullRomCurve3(points), 64, 0.01, 8, false );
    const sketchTubeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: {
                value: 0.0
            },
            isActive: {
                value: 0.0
            },
            progress: {
                value: 0.0
            }
        },
        vertexShader: /* glsl */`
            uniform float time;
            uniform float isActive;
            uniform float progress;
            varying float vOpacity;

            void main() {
                vOpacity = smoothstep(progress, progress + 0.01, uv.x) * ((1.0 + sin(-5.0*time + uv.x*50.0)) * 0.5 * 0.7 * isActive + 0.3);
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: /* glsl */`
            varying float vOpacity;
            void main() {
                gl_FragColor = vec4(0.3, 0.63, 0.66, vOpacity);
            }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,

    });
    const sketchTube = new THREE.Mesh( sketchTubeGeometry, sketchTubeMaterial );
    sketchTubesGroup.add(sketchTube);
}

let clickedOnMap = false;
let isClicking = false;
let clickStart = Date.now();
const clickSelectionDuration = 300;
let selectingTarget = false;
let targets = [];
const movementSpeed = 0.0001;


window.addEventListener('pointerdown', () => {
    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

    clickStart = Date.now();
    isClicking = true;
    mouseMovements = 0;

    if (audioEngine == undefined) {
        audioEngine = new AudioEngine();
    }
});

window.addEventListener('pointerup', ()=> {
    isClicking = false;
    controls.enableRotate = true;
    controls.enablePan = true;

    if (hoveredPoint) {
        if(selectingTarget) {
            selectingTarget = false;
            targets.push(hoveredPoint);
            if (targets.length == 1) createLinePath(focusedPoint, hoveredPoint);
            else createLinePath(targets[targets.length - 2], hoveredPoint);
        } else if (mouseMovements < maxMouseMovements) {
            listenAtPoint(hoveredPoint);
            targets = [];
            distancesBetweenPoints = [];
            sketchTubesGroup.remove(...sketchTubesGroup.children);
        }
    }
});


// Called in animate()
function moveAlongPath() {
    if(targets.length == 0) return;

    let target = targets[0];
    let direction = new THREE.Vector3();
    direction.subVectors(target, focusedPoint);
    direction.normalize();
    direction.multiplyScalar(movementSpeed);
    focusedPoint.add(direction);
    listenAtPoint(focusedPoint);

    if (focusedPoint.distanceTo(target) < movementSpeed) {
        targets.shift();
        distancesBetweenPoints.shift();
        sketchTubesGroup.remove(sketchTubesGroup.children[0]);
    }

    sketchTubesGroup.children[0].material.opacity = 1.0;
    sketchTubesGroup.children[0].material.uniforms.time.value += 0.01;
    sketchTubesGroup.children[0].material.uniforms.isActive.value = 1.0;
    sketchTubesGroup.children[0].material.uniforms.progress.value = 1.0 - focusedPoint.distanceTo(target) / distancesBetweenPoints[0];
}

//
window.addEventListener('wheel', (ev) => {
    lastInteraction = Date.now();
    controls.autoRotate = false;
});



let focusedPoint = null;
let hoveredPoint = null;
function listenAtPoint(point) {
    if (audioEngine) {
        audioEngine.listener.positionX.value = point.x;
        audioEngine.listener.positionY.value = 0.0;
        audioEngine.listener.positionZ.value = point.z;
    }

    const points = tree.nearest([point.x, point.z], guiParameters.searchLimit, selectionRadius);

    if (points.length) {
        if (audioEngine) {
            audioEngine.nodeNumber += 1;
            audioEngine.lastPlayedRank = -1;
        }

        nearestAudioPoints = points.sort((a, b) => 0.5 - Math.random());
        focusedPoint = point;
        previouslySelectedPoints.forEach((point) => {
            // const idx = pointsPosMap[point[0][2]*3];
            // if(idx == undefined) return;
            const idx = point[0][2];
            pointsObject.geometry.attributes.customColor.array[idx * 3] = particlesColors.r;
            pointsObject.geometry.attributes.customColor.array[idx * 3 + 1] = particlesColors.g;
            pointsObject.geometry.attributes.customColor.array[idx * 3 + 2] = particlesColors.b;
        });
        nearestAudioPoints.forEach((point, i) => {
            // const idx = pointsPosMap[point[0][2]*3];
            // if(idx == undefined) return;
            const idx = point[0][2];
            pointsObject.geometry.attributes.customColor.array[idx * 3] = particlesHighlightColor.r;
            pointsObject.geometry.attributes.customColor.array[idx * 3 + 1] = particlesHighlightColor.g;
            pointsObject.geometry.attributes.customColor.array[idx * 3 + 2] = particlesHighlightColor.b;
        });
        previouslySelectedPoints = nearestAudioPoints;
        pointsObject.geometry.attributes.customColor.needsUpdate = true;

        beamTubeMaterial.opacity = 0.3;
        beamTorusMaterial.opacity = 1.0;
        shapeTubeAt(beamTube, point);
        shapeTorusAt(beamTorus, point);
        controls.lookAtTarget = point.clone();
    }
}

function onClick(event) {
    lastInteraction = Date.now();
    controls.autoRotate = false;
}

window.addEventListener('click', onClick);

function changeScale(scale) {
    torus.scale.x = scale;
    torus.scale.y = scale;
    beamTube.scale.x = scale;
    beamTube.scale.z = scale;
    beamTorus.scale.x = scale;
    beamTorus.scale.y = scale;

    selectionRadius = defaultSelectionRadius * scale;

    shapeTorusAt(torus, torus.position);
    shapeTubeAt(beamTube, beamTube.position);
    shapeTorusAt(beamTorus, beamTorus.position);

    if (focusedPoint) listenAtPoint(focusedPoint);
}


// *************** Cloud *************** //
// const { cloud } = createCloud();


// Animate the scene
function animate() {
    requestAnimationFrame( animate );

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    const angle = Math.atan2(cameraDirection.x, cameraDirection.z);

    if (audioEngine) {
        audioEngine.listener.forwardX.value = Math.sin(angle);
        audioEngine.listener.forwardY.value = 0.0;
        audioEngine.listener.forwardZ.value = Math.cos(angle);

        audioEngine.listener.upX.value = 0;
        audioEngine.listener.upY.value = 1;
        audioEngine.listener.upZ.value = 0;
    }

    // Update the raycaster
    raycaster.setFromCamera( pointer, camera );
    const intersects = raycaster.intersectObject( planeMesh );


    if (intersects.length > 0) {
        const point = intersects[0].point;
        clickedOnMap = shapeTorusAt(torus, point);
        torus.material.opacity = clickedOnMap ? 1.0 : 0.5;
        hoveredPoint = point.clone();
    } else {
        torus.material.opacity = 0.0;
        clickedOnMap = false;
        hoveredPoint = null;
    }

    if (isClicking && Date.now() - clickStart > clickSelectionDuration && clickedOnMap && mouseMovements < maxMouseMovements && focusedPoint) {
        controls.autoRotate = false;
        controls.enableRotate = false;
        controls.enablePan = false;

        selectingTarget = true;
    }

    if (selectingTarget && hoveredPoint) {
        torus.material.color.set(0x4DA1A9)
    }
    else {
        torus.material.color.set(0xFFFFFF)
    }


    moveAlongPath(focusedPoint, 0.05);

    if (controls.lookAtTarget) {
        controls.target.x += (controls.lookAtTarget.x - controls.target.x) * 0.02;
        controls.target.y += (controls.lookAtTarget.y - controls.target.y) * 0.02;
        controls.target.z += (controls.lookAtTarget.z - controls.target.z) * 0.02;
    }

    if(lastInteraction + 10000 < Date.now() && guiParameters.autoRotate) {
        controls.autoRotate = true;
    }
    controls.update();

    // cloud.render(renderer, camera)
    renderer.render( scene, camera );
    // composer.render();
}

requestAnimationFrame( animate );


// Resize the canvas when the window is resized and move the camera to the correct position to fit the tree
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
});
