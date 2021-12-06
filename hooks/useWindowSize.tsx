import { useState, useEffect } from 'react';

interface Size {
  width: number | undefined;
  height: number | undefined;
}

export function useWindowSize() {
  const [size, setSize] = useState<Size>({
    width: undefined,
    height: undefined,
  });
  useEffect(() => {
    function handleResize() {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return size;
}
