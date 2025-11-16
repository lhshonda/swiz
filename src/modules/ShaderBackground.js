import * as THREE from 'three';

// commenting more than usual in order to document my learning

export class ShaderBackground {
  constructor(scene) {
    this.scene = scene;

    // variables that pass data from the JS code to the GLSL shaders
    this.uniforms = {
      iTime: { value: 0 }, // float representing the elapsed time in secs
      iResolution: {
        value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1), // 3D vector representing the viewport (height, width, aspect ratio)
      }, // making the shader calcs resolution independent 
      uComplexity: { value: 10 }, // main pattern frequency
      uSpeed: { value: 0.2 }, // animation speed
      uColorTwist: { value: 1.0 }, // rgb patterns
      uDetailIntensity: { value: 6.5 }, // higher = more detail
      uHighlightThreshold: { value: 0.3 }, // the highlight mask 
      uHighlightReduction: { value: 0.0 }, // dims the highlights 0.5 makes them 50% as bright
      uBrightness: { value: 1.0 }, // global brightness evaluated at the end
    };

    // frag shader is written in GLSL the OpenGL shading lang
    const fragmentShader = `
      //: matching variables defined earlier
      uniform float iTime;
      uniform vec3 iResolution; 
      uniform float uComplexity;
      uniform float uSpeed;
      uniform float uColorTwist;
      uniform float uDetailIntensity;
      uniform float uBrightness;
      uniform float uHighlightThreshold;
      uniform float uHighlightReduction;


      //: function to create the flowing wave pattern
      float pattern(vec2 uv, float time, vec2 freq, float twist) {
        float wave1 = sin(uv.x * freq.x + time + twist);
        float wave2 = tan(uv.y * freq.y + time + twist);
        return 0.5 + 0.5 * wave1 * wave2;
      }


      //: main function executed for each pixel
      void main() {
        //: gl_FragCoord.xy gives pixel coord on the screen (e.g. 150px, 250px)
        //: by dividing it by the iResolution.xy we can normalize it on a 0-1 range which is what we use for uv coords
        vec2 uv = gl_FragCoord.xy / iResolution.xy;
        
        //: scaling the incoming time to control the animation speed
        float time = iTime * uSpeed;

        //: base pattern defined using the custom uniform
        //: 4:3 ratio on x & y waves makes them go out of phase, creating an organic less repetitive pattern
        vec2 baseFreq = vec2(uComplexity, uComplexity * 0.75);
        
        //: generating the pattern for each color channel
        //: uColorTwist gives each channel a slightly different starting point
        float r = pattern(uv, time, baseFreq, 0.0);
        float g = pattern(uv, time, baseFreq, uColorTwist);
        float b = pattern(uv, time, baseFreq, uColorTwist * 2.0);

        //: combine the channels
        vec3 color = vec3(r, g, b);

        //: detail layer, reusing pattern function with higher frequencies
        vec2 detailFreq = vec2(uComplexity * 3.5, uComplexity * 4.0);
        float detail = pattern(uv, time, detailFreq, uColorTwist * 3.0);

        //: adding detail layer onto the base color
        color += detail * uDetailIntensity;

        //: clamping final color to [0, 1] valid range
        color = clamp(color, 0.0, 1.0);

        //: capturing highlights in accordance to Rec. 709
        //: each color channel is multiplied by the corresponding luminance coefficient and added together at the end
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));

        //: creates the smooth grayscale mask
        //: all pixels with a luminance below the uHighlightThreshold are pure black and those in between smoothly transition to white
        float mask = smoothstep(uHighlightThreshold, 1.0, luminance);

        //: applies a reduction based on the given grayscale mask
        color = mix(color, color * uHighlightReduction, mask);

        //: final contrast adjustment
        color = pow(color, vec3(1.2));

        //: final brightness adjustment
        color *= uBrightness;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // custom vertex shader that goes straight to gl_Position
    // it runs for every corner of the geometr, its job is to calc the final position of each vertex of the screen
    // this is a version meant to bypass cameras and 3D transformations, trying to remain performant for a wide variety of devices
    const vertexShader = `
      void main() {
        //: position is a built in attribute that has the vertex's local coords from -1 to 1
        //: since we pass it direction to gl_Position, the gpu receives info to draw said vertex directly in screen space
        //: this ensures the plane always fills the screen regardless of the camera
        gl_Position = vec4(position, 1.0); 
      }
    `;

    // making a flat plane geometry 2 units high and wide
    // fills the whole screen in the context of the vertex shader 
    const geometry = new THREE.PlaneGeometry(2, 2);

    // using the shader material bc of the custom GLSL shader
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthWrite: false, // bg does not need to write to the depth buffer
    });

    // object taking geometry and material to place onto scene
    this.mesh = new THREE.Mesh(geometry, material);

    // ensures bg is always rendered even if main camera's view frustum doesn't have the mesh's corners
    this.mesh.frustumCulled = false;

    this.scene.add(this.mesh);
    
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  // method called to handle window resizing 
  onResize() {
    this.uniforms.iResolution.value.set(
      window.innerWidth,
      window.innerHeight,
      1
    );
  }

  // called in the main animation loop, updates the iTime uniform with the elapsed time each frame
  update(time) {
    this.uniforms.iTime.value = time;
  }
}
