import { PortalPainting } from './PortalPainting';
import { FramedArtwork } from './FramedArtwork';
import { ThirdPersonPlayer } from './ThirdPersonPlayer';

interface GalleryWorldProps {
  nearPortal: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onReady: () => void;
}

const artworks = [
  '/assets/text.jpg', '/assets/sweesh.jpg', '/assets/hands.jpg',
  '/assets/mankey.jpg', '/assets/oilpainting.jpg', '/assets/plaster.jpg',
  '/assets/tree.jpg', '/assets/pocket_monsters.jpg',
];

export function GalleryWorld({ nearPortal, onNearPortal, onExit, onReady }: GalleryWorldProps) {
  return (
    <>
      <color attach='background' args={['#202b31']} />
      <fog attach='fog' args={['#202b31', 16, 36]} />
      <hemisphereLight args={['#dce6df', '#11191c', 1.4]} />
      <directionalLight
        castShadow
        intensity={2}
        position={[-6, 10, 4]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[32, 64]} />
        <meshStandardMaterial color='#829186' roughness={0.96} />
      </mesh>
      <mesh position={[0, -0.14, 0]}>
        <cylinderGeometry args={[32.2, 32.8, 0.28, 64]} />
        <meshStandardMaterial color='#45534b' />
      </mesh>
      {artworks.map((image, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2);
        return (
          <FramedArtwork
            key={image}
            image={image}
            position={[side * 5.5, 2.15, 5 - row * 4.2]}
            rotation={[0, side * -Math.PI / 2, 0]}
          />
        );
      })}
      <PortalPainting
        image='/assets/tree.jpg'
        position={[0, 2.2, 11.5]}
        rotation={[0, Math.PI, 0]}
        active={nearPortal}
        onEnter={onExit}
      />
      <ThirdPersonPlayer
        start={[0, 0, 7]}
        portalPosition={[0, 0, 11.5]}
        boundary={24}
        onNearPortal={onNearPortal}
        onEnterPortal={onExit}
        onReady={onReady}
      />
    </>
  );
}
