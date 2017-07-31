/*
 * Websensor Car Game
 * https://github.com/jessenie-intel/websensor-car
 *
 * Copyright (c) 2017 Jesse Nieminen
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.

*/
'use strict';

//Sliders
var slider_speed = document.getElementById("slider_speed");
var slider_speed_div = document.getElementById("slider_speed_amount");
slider_speed.onchange = () => {
        speed = slider_speed.value;
        slider_speed_div.innerHTML = speed;
        console.log("Speed:", speed);
};

var slider_zerobiascoeff = document.getElementById("slider_zerobiascoeff");
var slider_zerobiascoeff_div = document.getElementById("slider_zerobiascoeff_amount");
slider_zerobiascoeff.onchange = () => {
        zerobiascoeff = slider_zerobiascoeff.value;
        slider_zerobiascoeff_div.innerHTML = zerobiascoeff;
        console.log("Zero bias coeff:", zerobiascoeff);
};

/* Globals */
var xcoord_div = document.getElementById("xcoord");
var ycoord_div = document.getElementById("ycoord");
var roll_div = document.getElementById("roll");
var pitch_div = document.getElementById("pitch");
var yaw_div = document.getElementById("yaw");
var direction_div = document.getElementById("direction");
var force_div = document.getElementById("force");
var ut; //debug text update var
var mv; //movement update var

var sensorfreq = 60;

var orientation_sensor = null;

var loopvar = null;

var mode = "portrait";
var nosensors = false;      //Flag for testing without sensors

var roll = null;
var pitch = null;
var yaw = null;

var prevAngles = {"alpha": null, "beta": null, "gamma": null};
var angles = {"alpha": null, "beta": null, "gamma": null};
var angleDiff = {"alpha": null, "beta": null, "gamma": null};

var direction = null;
var force = null;
var offroad = false;

//Rendering vars (Three.JS)
var scene = null;
var sceneSky = null;   //separate scene for the skybox
var cameraSky = null;
var renderer = null;
var camera = null;

var loader = null;
var objloader = null;

var x = 0;      //car x coordinate
var y = 0;      //car y coordinate
var speed = 0.1;        //0.1 for threeJS, 10 for Physijs
var zerobiascoeff = 2;  //2 means 0.02 zerobias at 60Hz sensor polling rate

var fps           = 60;
var step          = 1/fps;                   // length of each frame in seconds
var segments = [];      //List of the parts of the road (segments)
var segmentLength = 10;    //Segment length in pixels
var roadLength = 300;   //road length in segments
var roadWidth = 5;    //Road width in pixels
var rumbleLength = 3;   //Length of a "rumble"
var curveLength = 5;    //How many segments a curve consists of
var obstacles = [];     //Array of the obstacles
var segmentMeshes = [];   //Array of the segment meshes
var carWidth = 1;
var sea = null;
var seaTex = null;
var w = 10000, h = 5000;
var loaded = false;
var texture = null;

var hud = null;
var carcube = null;
var carModel = null;
var carbb = null;

//Timer
var time=0;
var timerVar = null;

var gameview = null;

//var urlParams = null;

//PhysiJS vars
var friction = 0.8;
var restitution = 0;
var forcefactor = 2;
var mass = 200;

Physijs.scripts.worker = '/websensor-car/js/physijs_worker.js';
Physijs.scripts.ammo = 'ammo.js';

//Sensor classes and low-pass filter
class AbsOriSensor {
        constructor() {
        const sensor = new AbsoluteOrientationSensor({ frequency: sensorfreq });
        const mat4 = new Float32Array(16);
        const euler = new Float32Array(3);
        sensor.onreading = () => {
                sensor.populateMatrix(mat4);
                toEulerianAngle(sensor.quaternion, euler);      //From quaternion to Eulerian angles
                this.roll = euler[0];
                this.pitch = euler[1];
                this.yaw = euler[2];
                if (this.onreading) this.onreading();
        };
        sensor.onactivate = () => {
                if (this.onactivate) this.onactivate();
        };
        const start = () => sensor.start();
        Object.assign(this, { start });
        }
}

//WINDOWS 10 HAS DIFFERENT CONVENTION: Yaw z, pitch x, roll y
function toEulerianAngle(quat, out)
{
        const ysqr = quat[1] ** 2;

        // Roll (x-axis rotation).
        const t0 = 2 * (quat[3] * quat[0] + quat[1] * quat[2]);
        const t1 = 1 - 2 * (ysqr + quat[0] ** 2);
        out[0] = Math.atan2(t0, t1);
        // Pitch (y-axis rotation).
        let t2 = 2 * (quat[3] * quat[1] - quat[2] * quat[0]);
        t2 = t2 > 1 ? 1 : t2;
        t2 = t2 < -1 ? -1 : t2;
        out[1] = Math.asin(t2);
        // Yaw (z-axis rotation).
        const t3 = 2 * (quat[3] * quat[2] + quat[0] * quat[1]);
        const t4 = 1 - 2 * (ysqr + quat[2] ** 2);
        out[2] = Math.atan2(t3, t4);
        return out;
}


//Functions for the debug text and sliders

function updateSlider(slideAmount)
{
alert("error");
sliderDiv.innerHTML = slideAmount;
}

function updateText()   //For updating debug text
{
        roll_div.innerHTML = roll;
        pitch_div.innerHTML = pitch;
        yaw_div.innerHTML = yaw;
        direction_div.innerHTML = direction;
        force_div.innerHTML = force;
        xcoord_div.innerHTML = x;
        ycoord_div.innerHTML = y;
}

function getDirection(roll, pitch, yaw, mode="landscape")    //Returns the direction the car is turning towards
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {
                if(pitch < 0)
                {       
                        direction = "left";
                }
                else
                {
                        direction = "right";
                }
        }
        return direction;
}

function getForce(roll, pitch, yaw, mode="landscape")    //Returns the force the car will be turning with
{
        if(mode == "landscape")
        {
                direction = "todo";
        }
        else
        {      
                force = Math.abs(pitch/5);
        }
        return force;
}


function move(camera, car, model) //Moves the car(camera) and syncs the model to the car
{
        if(car !== undefined) {
                var velocity = new THREE.Vector3();
                var forcev = new THREE.Vector3();
                //Limit the angle to between [-pi/2, pi/2]
                if(angles.alpha > Math.PI/2)
                {
                        var alpha = Math.PI/2;
                }
                else if(angles.alpha < -Math.PI/2)
                {
                        var alpha = -Math.PI/2;
                }
                else
                {
                        var alpha = angles.alpha;
                }
                //in portrait: beta right-left, <0 left, >0 right in landscape: alpha right-left <0 left, >0 right
                        //velocity = ({x: car.getLinearVelocity().x-2*force, y: car.getLinearVelocity().y, z: car.getLinearVelocity().z-speed*Math.cos(car.rotation.z)});
                        //forcev = {x: -forcefactor/2*mass*force, y: 0, z: -forcefactor*mass*force};
                        //forcev = {x: (forcefactor/2)*mass*angles.beta, y: 0, z: -(forcefactor/6)*mass};
                        //velocity = ({x: car.getLinearVelocity().x+2*force, y: car.getLinearVelocity().y, z: car.getLinearVelocity().z-speed*Math.cos(car.rotation.z)});
                        //forcev = {x: forcefactor/2*mass*force, y: 0, z: -forcefactor*mass*force};
                        car.rotation.y = 2*angles.alpha;
                        car.__dirtyRotation = true;
                        forcev = {x: -(forcefactor/2)*mass*force*Math.sin(car.rotation.y), y: 0, z: -(forcefactor/6)*mass*Math.abs(Math.cos(car.rotation.y))}; 
                if(nosensors)    //no sensors
                {
                        //velocity = ({x: car.getLinearVelocity().x, y: car.getLinearVelocity().y, z: car.getLinearVelocity().z-speed*Math.cos(car.rotation.z)});
                        forcev = {x: 0, y: 0, z: -(forcefactor/6)*mass};
                }
                //Sync camera and car model with the car collision box
                //camera.position.x = car.position.x;
                //camera.position.z = car.position.z + 5;
                //model.position.setX(car.position.x);
                //model.position.setZ(car.position.z);
                //model.position.setY(car.position.y);
                //model.rotation.set(car.rotation);
                //model.rotation.x = car.rotation.x;
                //model.rotation.y = car.rotation.y + Math.PI/2;
                //model.rotation.z = car.rotation.z;
                //model.rotation.set(car.rotation.x, car.rotation.y, car.rotation.z );
                //model.rotateY(car.rotation.y-model.rotation.y);
                //model.rotateZ(car.rotation.z-model.rotation.z);
                //car.setLinearVelocity(velocity);
                car.applyCentralImpulse(forcev);
        }
}

function isOffRoad(car)      //Determines if the car is off the road or not by checking if the car has fallen enough far down
{
        if(car.position.y < -2)
        {
                return true;
        }
        else
        {
                return false;
        }
}

function gameOver() {
        var score = time;
        //Stop game loop
        clearInterval(loopvar);
        clearInterval(timerVar);
}

function update()       //Update direction and force
{
        if(!nosensors)
        {
                direction = getDirection(roll, pitch, yaw, mode);
                force = getForce(roll, pitch, yaw, mode);
        }
        else
        {
                force = 0.5;
        }
}

/*      Functions related to testing without sensors      */
function keyup_handler(event) {
    if (event.keyCode == 65 || event.keyCode == 68) {
        force = 0;
        direction = "none";
    }
}

function keypress_handler(event) {
    if (event.keyCode == 65) {  //A
        direction = "left";
    }
    if (event.keyCode == 68) {
        direction = "right";
    }
        force = 0.2;
}

function createGround() {
/*	seaTex = THREE.ImageUtils.loadTexture("road.png");
	seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
	seaTex.repeat.set(4, 2);
	var seaMat = new THREE.MeshPhongMaterial({
		specular: 0xffffff,
		shininess: 100,
		map: seaTex,
		bumpMap: seaTex,
		bumpScale: 5.0
	});
	var seaGeo = new THREE.PlaneGeometry(w, h);
	sea = new THREE.Mesh(seaGeo, seaMat);
        scene.add(sea);
        this.renderer.autoClear = false;
*/
                var geometryG = new THREE.BoxGeometry( w, 2, h );
                var materialGround = Physijs.createMaterial(
                    new THREE.MeshBasicMaterial({ color: "green" }),
                    friction,
                    restitution
                );
                        let textureG = loader.load('road.png');     //should the callback be used here?
                        let material = new THREE.MeshBasicMaterial( { map: textureG } );
                        let ground = new Physijs.BoxMesh( geometryG, materialGround , 0);
                        ground.position.set(0,-2.05,0);
		        scene.add( ground );
}

function createCar() {
        //Physics for any model: add model as threejs object and then add physijs box to it
        //var geometry = new THREE.BoxGeometry( carWidth, 1, 1 );
        var geometry = new THREE.BoxGeometry( (carbb.max.z-carbb.min.z)/2, (carbb.max.y-carbb.min.y)/2, (carbb.max.x-carbb.min.x)/2 );  //bb rotated because model also rotated
                var material = Physijs.createMaterial(
                    new THREE.MeshBasicMaterial({ color: "red" }),
                    friction,
                    restitution
                );
                material.visible = false;

        carcube = new Physijs.BoxMesh( geometry, material, mass );
        //carcube.add(texture);
        //car model: carmodel/lamborghini-aventador-pbribl.json, from https://clara.io/view/d3b82831-d56b-462f-b30c-500ea1c7f870
        /*let carObj = objloader.load('carmodel/lamborghini-aventador-pbribl.json', function ( obj ) {
		        scene.add( obj );
		        },
                        );*/
        //var geometry = objloader.load( "carmodel/lamborghini-aventador-pbribl.json");
        //let part1 = new Physijs.BoxMesh( geometry, new THREE.MeshFaceMaterial() );
        //carcube = new THREE.Object3D();
        //carcube.add( part1 );
        //carcube = new Physijs.BoxMesh( geometry, new THREE.MeshFaceMaterial(), mass );
        carcube.position.set(0, 0, 0);
        carModel.position.set(0, 0, 0);
        carcube.bb = new THREE.Box3().setFromObject(carcube); //create bounding box for collision detection        
        carcube.add(camera);    //chase camera
        carcube.add(carModel);       
        scene.add( carcube );
        //scene.add(carModel);
        /*
        carcube.material.transparent = true;
        carcube.material.opacity = 0;
        carcube.material.visible = false;
        carcube.material.needsUpdate = true;
        //carcube.visible = false;
        //carcube.material.visible = false;
        */
        carcube.setDamping(0.5, 0.5);
        var forcev2 = {x: 0, y: 0, z: -100};
        //carcube.applyCentralImpulse(forcev2); //kickstart
}


function render() {

        //Render HUD
        hud.innerHTML = -Math.floor(carcube.position.z);
        //For some reason need to always update the position to avoid the HUD disappearing
        hud.style.left = gameview.offsetLeft + 20 + "px";
        hud.style.top = gameview.offsetTop + 60 + "px";

                camera.lookAt(carcube.position);
                // Render loop
                renderer.render( sceneSky, cameraSky );  //skybox
                renderer.render(scene, camera);
                requestAnimationFrame(() => render());
}

//Main loop
function loop(camera, carcube) {
        update();
	// Infinite ocean
	//sea.position.x = camera.position.x;
	//sea.position.y = camera.position.y;
        //seaTex.offset.set(camera.position.x / w * seaTex.repeat.x, camera.position.y / h * seaTex.repeat.y);
        //threeObject.position.x = camera.position.x;
        //threeObject.position.y = camera.position.y;
        //threeObject.position.z = camera.position.z-50;                
        scene.simulate();
        move(camera, carcube, carModel);
        /*offroad = isOffRoad(carcube);
        if(offroad)
        {
                console.log("Offroad");
                gameOver();         
        } */  
        //speed = 0.1 + Math.abs(carcube.position.z/5000);  //increase speed bit by bit             
}

//The custom element where the game will be rendered
customElements.define("game-view", class extends HTMLElement {
        constructor() {
        super();

        //THREE.js render stuff
        renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        gameview = document.body.appendChild(renderer.domElement);
        
        scene = new Physijs.Scene();
        scene.setGravity(new THREE.Vector3( 0, -30, 0 ));

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 200);
        camera.target = new THREE.Vector3(0, 0, 0);

	camera.position.y = 1.5;
	camera.position.z = 3.5;

        this.manager = new THREE.LoadingManager();

        loader = new THREE.TextureLoader(this.manager);
        objloader = new THREE.ObjectLoader(this.manager);
	
        //skybox
        cameraSky = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
        sceneSky = new Physijs.Scene();
	var imgFolder = "bg/";
	var directions  = ["left", "right", "top", "bot", "back", "front"];
	var imageSuffix = ".png";
	var skyGeometry = new THREE.CubeGeometry( 1000, 1000, 1000 );	
	
	var materialArray = [];
	for (var i = 0; i < 6; i++)
		materialArray.push( new THREE.MeshBasicMaterial({
			map: loader.load( imgFolder + directions[i] + imageSuffix ),
			side: THREE.BackSide
		}));
	//var skyMaterial = new THREE.MeshFaceMaterial( materialArray );
	var skyBox = new THREE.Mesh( skyGeometry, materialArray );
        sceneSky.add( skyBox );

        //HUD
        hud = document.createElement('div');
        hud.id = "hud";
        hud.innerHTML = "haHAA";
        hud.style.left = gameview.offsetLeft + 20 + "px";
        hud.style.top = gameview.offsetTop + 60 + "px";
        hud.style.position = "absolute";
        document.body.appendChild(hud);

        this.loadObject();
                objloader.load( 'carmodel/lamborghini-aventador-pbribl.json', function(object) {
                //var k = objloader.parse(object);
                //console.log(k);
                object.scale.set(0.5,0.5,0.5);
                //object.position.set(0, -1, -2);      //should set according to road
                   //need to push by value
                //Object.assign(texture, object);
                //object.rotation.set(new THREE.Vector3( Math.PI / 2, 0, 0));
		//var mesh = new THREE.Mesh(object);
                object.rotateY(Math.PI/2);
                object.__dirtyRotation = true;
                //scene.add(object);
                carbb = new THREE.Box3().setFromObject(object);
                //console.log(carbb);
                carModel = object;
                loaded = true;
                //console.log(carModel);
	        console.log( 'Loading complete!');
                createCar();
                render();

                loopvar = setInterval(loop.bind(null, camera, carcube), step);
    });
        //scene.add(texture);
        //scene.add(this.texture);
        //console.log(texture);


        this.manager.onLoad = function ( ) {
                }
        }

        connectedCallback() {
        //urlParams = new URLSearchParams(window.location.search);
        //nosensors = urlParams.has('nosensors'); //to specify whether or not to use sensors in the URL
                try {
                //Initialize sensors
                orientation_sensor = new AbsOriSensor();        //TODO: use relative orientation sensor
                orientation_sensor.onreading = () => {
                        roll = orientation_sensor.roll;
                        pitch = orientation_sensor.pitch;
                        yaw = orientation_sensor.yaw;
                };
                orientation_sensor.onactivate = () => {
                };
                orientation_sensor.start();

                //below from https://w3c.github.io/motion-sensors/#complementary-filters
                const accl = new Accelerometer({frequency: sensorfreq});
                const gyro = new Gyroscope({frequency: sensorfreq});
                let timestamp = null;
                let alpha = 0;
                let beta = 0;
                let gamma = 0;
                const bias = 0.98;
                const zeroBias = zerobiascoeff*(0.6/sensorfreq);    //coeff*0.01 when 60Hz, with beta coeff 2, with alpha 0.5
                gyro.onreading = () => {

                        prevAngles = angles;
                   let dt = timestamp ? (gyro.timestamp - timestamp) / 1000 : 0;
                   timestamp = gyro.timestamp;

                   // Treat the acceleration vector as an orientation vector by normalizing it.
                   // Keep in mind that the if the device is flipped, the vector will just be
                   // pointing in the other direction, so we have no way to know from the
                   // accelerometer data which way the device is oriented.
                   const norm = Math.sqrt(accl.x ** 2 + accl.y ** 2 + accl.z ** 2);

                   // As we only can cover half (PI rad) of the full spectrum (2*PI rad) we multiply
                   // the unit vector with values from [-1, 1] with PI/2, covering [-PI/2, PI/2].
                   const scale = Math.PI / 2;

                        //alpha = alpha + gyro.z * dt;
                        alpha = (1 - zeroBias) * (alpha + gyro.z * dt);
                        beta = (1 - zeroBias) * (bias * (beta + gyro.x * dt) + (1.0 - bias) * (accl.x * scale / norm));
                        gamma = bias * (gamma + gyro.y * dt) + (1.0 - bias) * (accl.y * -scale / norm);

                        angles = {"alpha": alpha, "beta": beta, "gamma": gamma};
                        //angleDiff = {"alpha": alpha-prevAngles.alpha, "beta": beta-prevAngles.beta, "gamma": gamma-prevAngles.gamma};
                   // Do something with Euler angles (alpha, beta, gamma).
                 };

                 accl.start();
                 gyro.start();
                }
                catch(err) {
                        console.log(err.message);
                        console.log("Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags.");
                        this.innerHTML = "Your browser doesn't seem to support generic sensors. If you are running Chrome, please enable it in about:flags";
                        nosensors = true;
                }
                if(nosensors)
                {
                        window.addEventListener("keydown", keypress_handler, false);
                        window.addEventListener("keyup", keyup_handler, false);
                }
                createGround();
                this.buildRoad();
                this.drawRoad();
                this.createObstacles();

                timerVar=setInterval(function(){time = time + 10;},10);  //timer in ms, lowest possible value is 10, accurate enough though
        }


//Below from http://www.graemefulton.com/three-js-infinite-world-webgl-p1/

/** 
 * createTerrainMatrix
 * @TODO: create the matrix of terrains - need to add 9 bits of terrain
 */
/*createTerrainMatrix(scene, perlinNoise){
 
    //every 100px on the z axis, add a bit of ground
    for ( var z= 100; z > -200; z-=100 ) {
 
      //Create the perlin noise for the surface of the ground
        var perlinSurface = new PerlinSurface(perlinNoise, 100, 100);
      var ground = perlinSurface.surface;
      //rotate 90 degrees around the xaxis so we can see the terrain
      ground.rotation.x = -Math.PI/-2;
      // Then set the z position to where it is in the loop (distance of camera)
      ground.position.z = z;
      ground.position.y -=4;
 
      //add the ground to the scene
      scene.add(ground);
      //finally push it to the floor array
      this.floor.push(ground);
    }
 
}*/

/** 
 * moveWithCamera
 * when the camera gets past the first terrain, put the other in front of it
 */
 /*moveWithCamera(camera){
    // loop through each of the 3 floors
    for(var i=0; i<this.floor.length; i++) {
 
      //if the camera has moved past the entire square, move the square
      if((this.floor[i].position.z - 100)>camera.position.z){
 
        this.floor[i].position.z-=200;
      }
//if the camera has moved past the entire square in the opposite direction, move the square the opposite way 
          else if((this.floor[i].position.z + this.tileHeight)<camera.position.z){
 
            this.floor[i].position.z+=(this.tileHeight*2);
          }
 
    }
}
*/

        buildRoad() {
                let roadx = 0;  //keep track of x coordinate for curves
                for(let i=0; i<roadLength; i++)
                {
                        let segment = {"z":null, "y":null, "color":null, "type":null};
                        if(Math.random() > 0.1)      //add condition for curve here
                        {
                                if(Math.random() > 0.5) //right curve
                                {
                                        this.createCurve(i, roadx, "right");
                                        roadx = roadx + roadWidth;
                                }
                                else    //left curve
                                {
                                        this.createCurve(i, roadx, "left");
                                        roadx = roadx - roadWidth;                                
                                }
                                i = i + curveLength-1;  //push the index forward
                        }
                        else
                        {
                                segment.type = "straight";
                        }
                        segment.z = -(segmentLength*i);
                        segment.y = -2;
                        segment.x = roadx;    
                        segments.push(segment);
                }
                //color the segments
                for(let i=0; i<segments.length; i++)
                {
                        if(i%rumbleLength === 0)
                        {
                                segments[i].color = "white";
                        }
                        else
                        {
                                segments[i].color = "grey";
                        }
                }
        }

        createCurve(segmentStart, roadx, direction) {         //Creates a curve and adds it to the road
                for(let j=0; j<curveLength; j++)
                {
                        if(direction === "right") //right curve
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                segments.push(segment);
                        }
                        else
                        {
                                let segment = {"z":null, "y":null, "color":null, "type":null};
                                segment.type = "curve";
                                segment.z = -(segmentLength*(segmentStart+j));
                                segment.y = -2;
                                segment.x = roadx;
                                segments.push(segment);
                        }
                }
        }
        drawRoad() {    //Draws the road on the screen
                var geometry = new THREE.BoxGeometry( roadWidth, 2, segmentLength );
                var materialRoad = Physijs.createMaterial(
                    new THREE.MeshBasicMaterial({ color: "grey" }),
                    friction,
                    restitution
                );
                var road = new Physijs.BoxMesh(geometry, materialRoad, 0);
                for (let j=0; j<segments.length; j++)
                {
                        let texture = loader.load('road.png');     //should the callback be used here?
                        let material = new THREE.MeshBasicMaterial( { map: texture } );
                        let segment = new Physijs.BoxMesh( geometry, material , 0);
                        segment.position.set(segments[j].x,segments[j].y,segments[j].z);
                                segments[j].bb = new THREE.Box3().setFromObject(segment);     //create bounding box for collision detection             
                        segmentMeshes.push(segment);
                        road.add(segment);
		        scene.add( segment );
                }
        }

        loadObject() {
        }

        createObstacles() {     //Create obstacles that the player has to avoid crashing into
                for (let i=1; i<segments.length; i++)   //Randomly add obstacles, at most one per segment
                {
                        var geometry = new THREE.BoxGeometry( 0.5, 1, 0.5 );
                        var material = new THREE.MeshBasicMaterial( { color: "blue"} );
                        let obstacle = new Physijs.BoxMesh( geometry, material , 0);
                        obstacle.position.z = segments[i].z;
                        obstacle.position.y = -0.5;
                        obstacle.position.x = segments[i].x - roadWidth/2 + roadWidth * Math.random();
                        obstacle.bb = new THREE.Box3().setFromObject(obstacle); //create bounding box for collision
                        obstacles.push(obstacle);
                        scene.add( obstacle );
                }
        }
});

