import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** A golden-hour sky: amber horizon under a dusky blue zenith, sunlit clouds and a low sun. */
export function CapitalSky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec3 vDirection;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.08,.75,d.y);
        float sun=pow(max(0.,dot(d,normalize(vec3(-.65,.18,.75)))),2.);
        vec3 sky=mix(vec3(.98,.7,.5),vec3(.4,.44,.62),h);
        sky=mix(sky,vec3(1.,.83,.6),sun*(1.-h*.6));
        float cloud=noise(d*7.+vec3(4.,0.,0.))*.57+noise(d*15.)*.28+noise(d*31.)*.15;
        cloud=smoothstep(.46,.7,cloud)*smoothstep(-.04,.12,d.y)*(1.-smoothstep(.5,.9,d.y));
        sky=mix(sky,mix(vec3(.66,.52,.56),vec3(1.,.78,.58),sun),cloud*.7);
        float haze=1.-smoothstep(-.15,.13,d.y);sky=mix(sky,vec3(.92,.72,.6),haze*.45);
        // A soft disc behind the haze.
        float disc=max(0.,dot(d,normalize(vec3(-.65,.18,.75))));
        sky+=vec3(2.8,2.2,1.5)*pow(disc,900.)+vec3(.35,.22,.1)*pow(disc,60.);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh name="capital-sky" renderOrder={-100} material={material}>
      <sphereGeometry args={[600, 32, 16]} />
    </mesh>
  );
}
