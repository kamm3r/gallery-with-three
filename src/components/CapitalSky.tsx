import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Static dusk cloud field; the reference's warm horizon frames the cool masonry. */
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
        vec3 sky=mix(vec3(.83,.44,.20),vec3(.23,.36,.53),h);
        sky=mix(sky,vec3(.94,.57,.28),sun*(1.-h*.7));
        float cloud=noise(d*7.+vec3(4.,0.,0.))*.57+noise(d*15.)*.28+noise(d*31.)*.15;
        cloud=smoothstep(.46,.7,cloud)*smoothstep(-.04,.12,d.y)*(1.-smoothstep(.5,.9,d.y));
        sky=mix(sky,mix(vec3(.52,.38,.32),vec3(.89,.65,.46),sun),cloud*.65);
        float haze=1.-smoothstep(-.15,.13,d.y);sky=mix(sky,vec3(.63,.46,.37),haze*.35);
        // A hot disc behind the haze; bloom turns it into the footage's glare.
        float disc=max(0.,dot(d,normalize(vec3(-.65,.18,.75))));
        sky+=vec3(3.2,2.1,1.1)*pow(disc,900.)+vec3(.5,.28,.12)*pow(disc,60.);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh name="capital-dusk-sky" renderOrder={-100} material={material}>
      <sphereGeometry args={[600, 32, 16]} />
    </mesh>
  );
}
